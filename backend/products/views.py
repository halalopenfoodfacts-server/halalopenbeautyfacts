import hashlib
import re

from django.contrib.postgres.search import SearchQuery, SearchRank
from django.core.cache import cache
from django.db import OperationalError, connection, transaction
from django.contrib.postgres.fields import ArrayField
from django.db.models import F, FloatField, Func, Subquery, TextField, Value
from django.db.models.functions import Cast, Ln, Lower
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .halal import HALAL, HARAM, STATUSES
from .models import Product
from .serializers import ProductDetailSerializer, ProductListSerializer
from .stats import FACET_TYPES, facet_key, stats_key
from .tasks import IMAGE_PAUSE_KEY, IMAGE_RETRY_TTL, fill_missing_images, image_queue_key

SEARCH_RESPONSE_TTL = 300   # 5 min : réponse complète d'une page de recherche
SEARCH_COUNT_TTL = 1800     # 30 min : le COUNT(*) est la partie la plus coûteuse

DEFAULT_PAGE_SIZE = 24
MAX_PAGE_SIZE = 100
# Au-delà, l'OFFSET sur 4,5 M de lignes coûte des dizaines de secondes (page=5000 : 25 s).
MAX_PAGE = 200
# COUNT plafonné quand un filtre est actif : on arrête de compter au-delà (is_count_exact=False).
COUNT_CAP = 10_000
PREFIX_COUNT_CAP = 500

# Tri par popularité + filtre rare : PostgreSQL parcourt l'index de popularité jusqu'à trouver
# assez de lignes (préfixe rare : 191 s mesurées). On borne ce chemin rapide, puis on se replie
# sur une récupération bornée des correspondances (index GIN / parcours limité), triée ensuite.
FAST_PATH_TIMEOUT_MS = 800
FALLBACK_CANDIDATES = 5000

BARCODE_RE = re.compile(r'^\d{6,14}$')
CODE_RE = re.compile(r'^[0-9A-Za-z_-]{1,64}$')

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────


def _portal(request):
    portal = request.GET.get('portal', request.headers.get('X-Portal', 'food'))
    return portal if portal in (Product.PORTAL_FOOD, Product.PORTAL_BEAUTY) else Product.PORTAL_FOOD


def _int_param(request, name, default, minimum, maximum):
    """Entier borné ; une valeur invalide prend la valeur par défaut (avant : erreur 500)."""
    try:
        value = int(request.GET.get(name, default))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(value, maximum))


def _values(request, name):
    """Accepte ?x=a&x=b et ?x=a,b."""
    out = []
    for raw in request.GET.getlist(name):
        out.extend(v.strip() for v in raw.split(',') if v.strip())
    return out


def _tag_array(column):
    return Func(Lower(column), Value(','), function='string_to_array', output_field=ArrayField(TextField()))


def _apply_filters(qs, request):
    """Filtres communs : labels / catégories / pays / halal / Nutri-Score / NOVA / huile de palme."""
    for column in ('labels_tags', 'categories_tags', 'countries_tags'):
        values = [v.lower() for v in _values(request, column)]
        if values:
            # string_to_array(lower(col), ',') @> ARRAY[…] — servi par les index GIN de la migration 0003
            qs = qs.annotate(**{f'{column}_arr': _tag_array(column)}).filter(**{f'{column}_arr__contains': values})

    # Statut calculé (labels + ingrédients, voir halal.py) : is_halal / is_excluded gardés pour les anciens clients
    if request.GET.get('is_halal') == '1':
        qs = qs.filter(halal_status=HALAL)
    if request.GET.get('is_excluded') == '1':
        qs = qs.filter(halal_status=HARAM)
    statuses = [s for s in _values(request, 'halal_status') if s in STATUSES]
    if statuses:
        qs = qs.filter(halal_status__in=statuses)

    grades = [g.lower() for g in _values(request, 'nutriscore') if g.lower() in 'abcde' and len(g) == 1]
    if grades:
        qs = qs.filter(data__nutriscore_grade__in=grades)
    groups = [g for g in _values(request, 'nova') if g in ('1', '2', '3', '4')]
    if groups:
        # nova_group est stocké tel quel par l'import CSV (texte « 4 » ou nombre 4)
        qs = qs.filter(data__nova_group__in=groups + [int(g) for g in groups])
    if request.GET.get('palm_oil_free') == '1':
        qs = qs.filter(data__ingredients_analysis_tags__icontains='en:palm-oil-free')
    return qs


_FILTER_PARAMS = (
    'labels_tags', 'categories_tags', 'countries_tags', 'is_halal', 'is_excluded', 'halal_status',
    'nutriscore', 'nova', 'palm_oil_free',
)


def _filter_signature(request):
    return '|'.join(f'{p}={",".join(sorted(request.GET.getlist(p)))}' for p in ('q', 'prefix') + _FILTER_PARAMS)


def _count(qs, request):
    """Renvoie (total, exact). Sur 4,5 M de produits un COUNT(*) filtré coûte 1 à 10 s."""
    q = request.GET.get('q', '').strip()
    has_filter = any(request.GET.get(p) for p in _FILTER_PARAMS)
    if not q and not has_filter:
        precomputed = cache.get(stats_key(_portal(request)))
        if precomputed:
            return precomputed['total'], True
    raw = _filter_signature(request)
    key = f'search:count:v2:{_portal(request)}:{hashlib.md5(raw.encode()).hexdigest()}'
    cached = cache.get(key)
    if cached is not None:
        return tuple(cached)
    # Le sous-select LIMIT s'arrête dès cap + 1 lignes trouvées (recherche instantanée : cap réduit).
    cap = PREFIX_COUNT_CAP if request.GET.get('prefix') == '1' else COUNT_CAP
    total = qs.order_by()[:cap + 1].count()
    result = (min(total, cap), total <= cap)
    cache.set(key, list(result), SEARCH_COUNT_TTL)
    return result


def _response_key(request, view_name):
    raw = request.GET.urlencode() + '|' + _portal(request)
    return f'search:resp:v2:{view_name}:{hashlib.md5(raw.encode()).hexdigest()}'


def _filter_fields(data_list, fields_param):
    """Filtre les champs de la réponse selon le paramètre fields= du frontend."""
    if not fields_param:
        return data_list
    allowed = {f.strip() for f in fields_param.split(',') if f.strip()}
    # Toujours garder ce qui sert à afficher une carte produit
    allowed.update({'code', 'image_front_small_url', 'image_front_url', 'halal_status'})
    return [{k: v for k, v in item.items() if k in allowed} for item in data_list]


def _queue_missing_images(portal, products):
    """Demande en arrière-plan la photo des produits affichés sans image (une fois par semaine au plus)."""
    if cache.get(IMAGE_PAUSE_KEY):
        return
    codes = [p.code for p in products
             if not (p.image_front_small_url or p.image_front_url)
             and cache.add(image_queue_key(portal, p.code), '1', IMAGE_RETRY_TTL)]
    if not codes:
        return
    try:
        fill_missing_images.delay(portal, codes)
    except Exception:
        # Broker indisponible : la page s'affiche quand même, on réessaiera plus tard
        cache.delete_many([image_queue_key(portal, c) for c in codes])


def _search_query(q, prefix):
    if prefix:
        words = re.findall(r'\w+', q, flags=re.UNICODE)[:6]
        if words:
            raw = ' & '.join(words[:-1] + [words[-1] + ':*'])
            return SearchQuery(raw, search_type='raw', config='french')
    return SearchQuery(q, config='french')


def _search_queryset(request, default_sort):
    portal = _portal(request)
    qs = Product.objects.filter(portal=portal)
    q = request.GET.get('q', '').strip()[:200]
    if q:
        prefix = request.GET.get('prefix') == '1'
        query = _search_query(q, prefix)
        qs = qs.filter(search_vector=query)
        if prefix:
            # Recherche instantanée : calculer le rang de 100 000 correspondances coûte ~12 s,
            # l'index de popularité répond en quelques ms.
            qs = qs.order_by('-unique_scans_n')
        else:
            # Pertinence pondérée par la popularité : le pot de Nutella avant « Nutella croissant »
            score = SearchRank('search_vector', query) * (
                Value(1.0) + Ln(Cast(F('unique_scans_n'), FloatField()) + Value(1.0))
            )
            qs = qs.annotate(score=score).order_by('-score')
    else:
        sort_map = {
            'unique_scans_n': '-unique_scans_n',
            'popularity_key': '-unique_scans_n',
            'popularity': '-unique_scans_n',
            'last_modified_t': '-last_modified_t',
            'created_t': '-last_modified_t',
            'product_name': 'product_name',
        }
        qs = qs.order_by(sort_map.get(request.GET.get('sort_by', default_sort), '-unique_scans_n'))
    return _apply_filters(qs, request), q


def _fetch_page(qs, start, size, ranked):
    if ranked or connection.vendor != 'postgresql':
        return list(qs[start:start + size])
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute(f'SET LOCAL statement_timeout = {FAST_PATH_TIMEOUT_MS}')
            return list(qs[start:start + size])
    except OperationalError:
        candidates = qs.order_by().values('id')[:max(FALLBACK_CANDIDATES, start + size)]
        return list(qs.filter(id__in=Subquery(candidates))[start:start + size])


def _barcode_match(request, q):
    """Une saisie numérique (EAN/UPC) ouvre directement le produit correspondant."""
    if not BARCODE_RE.match(q):
        return None
    portal = _portal(request)
    candidates = {q, q.zfill(13)} if len(q) < 13 else {q, q.lstrip('0')}
    return Product.objects.filter(portal=portal, code__in=candidates).first()


def _search_payload(request, view_name, default_sort):
    resp_key = _response_key(request, view_name)
    cached = cache.get(resp_key)
    if cached is not None:
        return cached

    page = _int_param(request, 'page', 1, 1, MAX_PAGE)
    page_size = _int_param(request, 'page_size', DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    qs, q = _search_queryset(request, default_sort)

    exact_product = _barcode_match(request, q) if q else None
    if exact_product is not None:
        products, total, exact = [exact_product] if page == 1 else [], 1, True
    else:
        total, exact = _count(qs, request)
        start = (page - 1) * page_size
        ranked = bool(q) and request.GET.get('prefix') != '1'
        products = _fetch_page(qs, start, page_size, ranked) if start < total else []

    _queue_missing_images(_portal(request), products)
    data = _filter_fields(ProductListSerializer(products, many=True).data, request.GET.get('fields', ''))
    payload = {
        'count': total,
        'page': page,
        'page_size': page_size,
        'page_count': min(MAX_PAGE, -(-total // page_size)) if total else 0,
        'is_count_exact': exact,
        'products': data,
    }
    if exact_product is not None:
        payload['barcode_match'] = exact_product.code
    cache.set(resp_key, payload, SEARCH_RESPONSE_TTL)
    return payload


# ─────────────────────────────────────────────
# 1. Search catalogue — GET /api/v2/search
# Compatible avec world.openfoodfacts.org/api/v2/search
# ─────────────────────────────────────────────

@api_view(['GET'])
def search(request):
    return Response(_search_payload(request, 'search', 'unique_scans_n'))


# ─────────────────────────────────────────────
# 2. Search texte — GET /api/search/search
# Compatible avec search.openfoodfacts.org (retourne hits au lieu de products)
# ─────────────────────────────────────────────

@api_view(['GET'])
def search_text(request):
    payload = dict(_search_payload(request, 'search_text', 'unique_scans_n'))
    payload['hits'] = payload['products']   # format Search-a-licious attendu par d'anciens clients
    return Response(payload)


# ─────────────────────────────────────────────
# 3. Détail produit — GET /api/v2/product/<code> et /api/v2/product/<code>.json
# ─────────────────────────────────────────────

@api_view(['GET'])
def product_detail(request, code):
    code = code.removesuffix('.json')
    if not CODE_RE.match(code):
        return Response({'status': 0, 'status_verbose': 'invalid code', 'code': code[:64]},
                        status=http_status.HTTP_400_BAD_REQUEST)
    portal = _portal(request)
    product = Product.objects.filter(portal=portal, code=code).first()
    if product is None and BARCODE_RE.match(code):
        alt = code.zfill(13) if len(code) < 13 else code.lstrip('0')
        product = Product.objects.filter(portal=portal, code=alt).first()
    if product is None:
        return Response({'status': 0, 'status_verbose': 'product not found', 'code': code},
                        status=http_status.HTTP_404_NOT_FOUND)

    _queue_missing_images(portal, [product])
    serializer = ProductDetailSerializer(product)
    return Response({'status': 1, 'status_verbose': 'product found', 'product': serializer.data})


# ─────────────────────────────────────────────
# 4. Stats globales — GET /api/stats
# ─────────────────────────────────────────────

@api_view(['GET'])
def stats(request):
    """Lit les stats pré-calculées par la tâche Celery `refresh_stats`.

    Avant : parcours des 4,5 M de lignes à chaque visite (> 30 s, cache 60 s)
    → compteurs de la page d'accueil en échec et workers gunicorn bloqués.
    """
    portal = _portal(request)
    data = cache.get(stats_key(portal))
    if data:
        return Response(data)
    _trigger_refresh(portal)
    return Response(
        {'portal': portal, 'status': 'computing'},
        status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
        headers={'Retry-After': '120'},
    )


def _trigger_refresh(portal):
    """Lance le recalcul en arrière-plan (au plus une fois toutes les 10 min)."""
    if cache.add(f'refresh_requested:{portal}', '1', 600):
        from .tasks import refresh_stats
        refresh_stats.delay(portal)


# ─────────────────────────────────────────────
# 5. Top produits — GET /api/top
# ─────────────────────────────────────────────

@api_view(['GET'])
def top_products(request):
    portal = _portal(request)
    page_size = _int_param(request, 'page_size', 12, 1, 50)
    cache_key = f'top_{portal}_{page_size}'
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    products = list(
        Product.objects.filter(portal=portal, unique_scans_n__gt=0)
        .order_by('-unique_scans_n')[:page_size]
    )
    _queue_missing_images(portal, products)
    data = {'products': ProductListSerializer(products, many=True).data}
    cache.set(cache_key, data, timeout=300)
    return Response(data)


# ─────────────────────────────────────────────
# 6. Derniers produits — GET /api/recent
# ─────────────────────────────────────────────

@api_view(['GET'])
def recent_products(request):
    portal = _portal(request)
    page_size = _int_param(request, 'page_size', 12, 1, 50)
    products = list(
        Product.objects.filter(portal=portal)
        .exclude(product_name='')
        .order_by('-last_modified_t')[:page_size]
    )
    _queue_missing_images(portal, products)
    return Response({'products': ProductListSerializer(products, many=True).data})


# ─────────────────────────────────────────────
# 7. Facets — GET /api/facets/<type>
# Compatible avec /proxy/facets/contributors.json et countries.json
# ─────────────────────────────────────────────

@api_view(['GET'])
def facets(request, facet_type):
    """Facets pré-calculées (format Open Food Facts : tags[].id/name/products)."""
    facet_type = facet_type.removesuffix('.json')
    if facet_type not in FACET_TYPES:
        return Response({'error': 'Facet type non supporté'}, status=http_status.HTTP_400_BAD_REQUEST)
    portal = _portal(request)
    data = cache.get(facet_key(portal, facet_type))
    if data:
        return Response(data)
    _trigger_refresh(portal)
    return Response(
        {'tags': [], 'status': 'computing'},
        status=http_status.HTTP_503_SERVICE_UNAVAILABLE,
        headers={'Retry-After': '120'},
    )


# ─────────────────────────────────────────────
# 8. Statut sync — GET /api/sync/status
# ─────────────────────────────────────────────

@api_view(['GET'])
def sync_status(request):
    from .models import SyncLog
    logs = SyncLog.objects.all()[:10]
    data = [{
        'portal': l.portal,
        'type': l.sync_type,
        'started': l.started_at.isoformat(),
        'finished': l.finished_at.isoformat() if l.finished_at else None,
        'added': l.products_added,
        'updated': l.products_updated,
        'status': l.status,
    } for l in logs]
    return Response({'syncs': data})
