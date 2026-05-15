from django.db.models import Q
from django.contrib.postgres.search import SearchQuery, SearchRank
from django.core.cache import cache
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status as http_status

from .models import Product
from .serializers import ProductListSerializer, ProductDetailSerializer

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _portal(request):
    return request.GET.get('portal', request.headers.get('X-Portal', 'food'))


def _apply_filters(qs, request):
    """Applique les filtres communs labels/catégories/pays/halal"""
    labels = request.GET.get('labels_tags', '')
    if labels:
        for label in labels.split(','):
            label = label.strip()
            if label:
                qs = qs.filter(labels_tags__icontains=label)

    categories = request.GET.get('categories_tags', '')
    if categories:
        qs = qs.filter(categories_tags__icontains=categories)

    countries = request.GET.get('countries_tags', '')
    if countries:
        qs = qs.filter(countries_tags__icontains=countries)

    if request.GET.get('is_halal') == '1':
        qs = qs.filter(is_halal=True)
    if request.GET.get('is_excluded') == '1':
        qs = qs.filter(is_excluded=True)

    return qs


def _paginate(qs, request):
    try:
        page = max(1, int(request.GET.get('page', 1)))
        page_size = min(int(request.GET.get('page_size', 24)), 100)
    except (ValueError, TypeError):
        page, page_size = 1, 24
    total = qs.count()
    start = (page - 1) * page_size
    products = qs[start:start + page_size]
    return products, total, page, page_size


def _filter_fields(data_list, fields_param):
    """Filtre les champs de la réponse selon le paramètre fields= du frontend"""
    if not fields_param:
        return data_list
    allowed = set(f.strip() for f in fields_param.split(',') if f.strip())
    # Toujours garder code et image pour l'affichage
    allowed.update({'code', 'image_front_small_url', 'image_front_url'})
    return [{k: v for k, v in item.items() if k in allowed} for item in data_list]


# ─────────────────────────────────────────────
# 1. Search catalogue — GET /api/v2/search
# Compatible avec world.openfoodfacts.org/api/v2/search
# ─────────────────────────────────────────────

@api_view(['GET'])
def search(request):
    portal = _portal(request)
    qs = Product.objects.filter(portal=portal)

    q = request.GET.get('q', '').strip()
    if q:
        search_query = SearchQuery(q, config='french')
        qs = (
            qs.filter(search_vector=search_query)
            .annotate(rank=SearchRank('search_vector', search_query))
            .order_by('-rank')
        )
    else:
        sort_map = {
            'unique_scans_n': '-unique_scans_n',
            'popularity_key': '-unique_scans_n',
            'last_modified_t': '-last_modified_t',
            'product_name': 'product_name',
        }
        sort = sort_map.get(request.GET.get('sort_by', 'unique_scans_n'), '-unique_scans_n')
        qs = qs.order_by(sort)

    qs = _apply_filters(qs, request)
    products, total, page, page_size = _paginate(qs, request)
    serializer = ProductListSerializer(products, many=True)
    data = _filter_fields(serializer.data, request.GET.get('fields', ''))

    return Response({
        'count': total,
        'page': page,
        'page_size': page_size,
        'is_count_exact': True,
        'products': data,
    })


# ─────────────────────────────────────────────
# 2. Search texte — GET /api/search/search
# Compatible avec search.openfoodfacts.org (retourne hits au lieu de products)
# ─────────────────────────────────────────────

@api_view(['GET'])
def search_text(request):
    portal = _portal(request)
    qs = Product.objects.filter(portal=portal)

    q = request.GET.get('q', '').strip()
    if q:
        search_query = SearchQuery(q, config='french')
        qs = (
            qs.filter(search_vector=search_query)
            .annotate(rank=SearchRank('search_vector', search_query))
            .order_by('-rank')
        )
    else:
        qs = qs.order_by('-unique_scans_n')

    qs = _apply_filters(qs, request)
    products, total, page, page_size = _paginate(qs, request)
    serializer = ProductListSerializer(products, many=True)
    data = _filter_fields(serializer.data, request.GET.get('fields', ''))

    return Response({
        'count': total,
        'page': page,
        'page_size': page_size,
        'is_count_exact': True,
        'hits': data,          # ← format Search-a-licious attendu par le frontend
        'products': data,      # ← aussi products pour compatibilité
    })


# ─────────────────────────────────────────────
# 3. Détail produit — GET /api/v2/product/<code> et /api/v2/product/<code>.json
# ─────────────────────────────────────────────

@api_view(['GET'])
def product_detail(request, code):
    # Enlever l'extension .json si présente
    code = code.removesuffix('.json')
    portal = _portal(request)
    try:
        product = Product.objects.get(portal=portal, code=code)
    except Product.DoesNotExist:
        return Response({'status': 'product not found', 'code': code}, status=http_status.HTTP_404_NOT_FOUND)

    serializer = ProductDetailSerializer(product)
    return Response({'status': 1, 'status_verbose': 'product found', 'product': serializer.data})


# ─────────────────────────────────────────────
# 4. Stats globales — GET /api/stats
# ─────────────────────────────────────────────

@api_view(['GET'])
def stats(request):
    portal = _portal(request)
    cache_key = f'stats_{portal}'
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    qs = Product.objects.filter(portal=portal)
    total = qs.count()
    halal_count = qs.filter(is_halal=True).count()
    excluded_count = qs.filter(is_excluded=True).count()

    # Compter les pays uniques en décomposant les tags séparés par virgule
    # countries_tags ressemble à "en:france,en:spain" — on compte les noms individuels
    from django.db.models.functions import Upper
    all_tags = qs.exclude(countries_tags='').values_list('countries_tags', flat=True)
    unique_countries = set()
    for row in all_tags.iterator(chunk_size=5000):
        for tag in str(row).split(','):
            tag = tag.strip().lower()
            if tag.startswith('en:'):
                unique_countries.add(tag[3:])
            elif tag:
                unique_countries.add(tag)
    countries_count = len(unique_countries)

    contributors_count = (
        qs.exclude(creator='').values('creator').distinct().count()
    )

    data = {
        'portal': portal,
        'total': total,
        'halal': halal_count,
        'excluded': excluded_count,
        'countries': countries_count,
        'contributors': contributors_count,
    }
    # Cache 60s pour une synchronisation quasi-temps réel
    cache.set(cache_key, data, timeout=60)
    return Response(data)


# ─────────────────────────────────────────────
# 5. Top produits — GET /api/top
# ─────────────────────────────────────────────

@api_view(['GET'])
def top_products(request):
    portal = _portal(request)
    page_size = min(int(request.GET.get('page_size', 12)), 50)
    cache_key = f'top_{portal}_{page_size}'
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    products = (
        Product.objects.filter(portal=portal, unique_scans_n__gt=0)
        .order_by('-unique_scans_n')[:page_size]
    )
    serializer = ProductListSerializer(products, many=True)
    data = {'products': serializer.data}
    cache.set(cache_key, data, timeout=300)
    return Response(data)


# ─────────────────────────────────────────────
# 6. Derniers produits — GET /api/recent
# ─────────────────────────────────────────────

@api_view(['GET'])
def recent_products(request):
    portal = _portal(request)
    page_size = min(int(request.GET.get('page_size', 12)), 50)
    products = (
        Product.objects.filter(portal=portal)
        .exclude(product_name='')
        .order_by('-last_modified_t')[:page_size]
    )
    serializer = ProductListSerializer(products, many=True)
    return Response({'products': serializer.data})


# ─────────────────────────────────────────────
# 7. Facets — GET /api/facets/<type>
# Compatible avec /proxy/facets/contributors.json et countries.json
# ─────────────────────────────────────────────

@api_view(['GET'])
def facets(request, facet_type):
    # Enlever .json si présent dans le type
    facet_type = facet_type.removesuffix('.json')
    portal = _portal(request)
    cache_key = f'facet_{portal}_{facet_type}'
    cached = cache.get(cache_key)
    if cached:
        return Response(cached)

    from django.db.models import Count

    if facet_type == 'countries':
        qs = (
            Product.objects.filter(portal=portal)
            .exclude(countries_tags='')
            .values('countries_tags')
            .annotate(count=Count('id'))
            .order_by('-count')[:100]
        )
        data = [{'name': r['countries_tags'], 'count': r['count']} for r in qs]
    elif facet_type == 'contributors':
        qs = (
            Product.objects.filter(portal=portal)
            .exclude(creator='')
            .values('creator')
            .annotate(count=Count('id'))
            .order_by('-count')[:100]
        )
        data = [{'name': r['creator'], 'count': r['count']} for r in qs]
    else:
        return Response({'error': 'Facet type non supporté'}, status=http_status.HTTP_400_BAD_REQUEST)

    result = {'tags': data}
    cache.set(cache_key, result, timeout=3600)
    return Response(result)


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

