"""
Fonctions communautaires et d'aide à l'achat :

    POST /api/v2/classify              texte d'ingrédients (photo lue sur le téléphone) → statut
    GET  /api/v2/alternatives/<code>   produits halal de la même catégorie
    POST /api/v2/report                « ce statut me semble faux » (traité dans l'admin)
    GET  /api/v2/challenge             défi de la semaine : produits populaires à compléter
    GET  /api/v2/share/<code>          page de partage (aperçu WhatsApp / Facebook) → fiche produit
    GET  /api/v2/og/<code>.png         image d'aperçu 1200 × 630 du produit et de son statut
"""
import datetime
import html
import io
import json
import urllib.request
from collections import Counter

from django.core.cache import cache
from django.db import OperationalError, connection, transaction
from django.http import HttpResponse
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .halal import HALAL, STATUS_LABEL, UNKNOWN, classify, classify_product, parse_tags
from .models import Product, StatusReport, WeeklyChallenge
from .serializers import ProductListSerializer
from .views import CODE_RE, _portal, _tag_array

MAX_TEXT = 8000
ALTERNATIVES = 8
CHALLENGE_SIZE = 20
SITES = {
    'food': {'name': 'Halal Open Food Facts', 'domain': 'https://halalopenfoodfacts.org', 'accent': (31, 122, 71)},
    'beauty': {'name': 'Halal Open Beauty Facts', 'domain': 'https://halalopenbeautyfacts.org', 'accent': (122, 53, 144)},
}
STATUS_COLORS = {
    'halal': (21, 107, 59), 'haram': (180, 35, 24), 'doubtful': (153, 84, 0), 'unknown': (75, 85, 99),
}


def _client_ip(request):
    return request.headers.get('X-Real-IP') or request.META.get('REMOTE_ADDR', '')


def _rate_limited(request, name, limit, window=3600):
    """Au plus `limit` appels par adresse IP et par fenêtre (en secondes)."""
    key = f'rate:{name}:{_client_ip(request)}'
    if cache.add(key, 1, window):
        return False
    try:
        return cache.incr(key) > limit
    except ValueError:
        return False


def _json_body(request):
    try:
        return json.loads(request.body or b'{}')
    except (ValueError, UnicodeDecodeError):
        return None


# ─────────────────────────────────────────────
# Analyse d'un texte d'ingrédients
# ─────────────────────────────────────────────

@api_view(['POST'])
def classify_text(request):
    body = _json_body(request)
    if not isinstance(body, dict) or not isinstance(body.get('text'), str):
        return Response({'error': 'text attendu'}, status=http_status.HTTP_400_BAD_REQUEST)
    if _rate_limited(request, 'classify', 120):
        return Response({'error': 'trop de requêtes'}, status=http_status.HTTP_429_TOO_MANY_REQUESTS)
    text = body['text'][:MAX_TEXT]
    result = classify(None, None, None, text, _portal(request))
    return Response({'status': result['status'], 'label': result['label'], 'summary': result['summary'],
                     'reasons': result['reasons'], 'ingredient_signals': result['ingredient_signals']})


# ─────────────────────────────────────────────
# Alternatives halal
# ─────────────────────────────────────────────

def _halal_in_category(portal, category, exclude_code):
    qs = (Product.objects.filter(portal=portal, halal_status=HALAL).exclude(code=exclude_code)
          .exclude(product_name='')
          .annotate(categories_tags_arr=_tag_array('categories_tags'))
          .filter(categories_tags_arr__contains=[category])
          .order_by('-unique_scans_n'))
    if connection.vendor != 'postgresql':
        return list(qs[:ALTERNATIVES])
    # Catégorie rare : le parcours de l'index de popularité peut être long, on le borne
    try:
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute('SET LOCAL statement_timeout = 1500')
            return list(qs[:ALTERNATIVES])
    except OperationalError:
        return []


@api_view(['GET'])
def alternatives(request, code):
    code = code.removesuffix('.json')
    if not CODE_RE.match(code):
        return Response({'error': 'code invalide'}, status=http_status.HTTP_400_BAD_REQUEST)
    portal = _portal(request)
    key = f'alternatives:v1:{portal}:{code}'
    cached = cache.get(key)
    if cached is not None:
        return Response(cached)
    product = Product.objects.filter(portal=portal, code=code).only('categories_tags').first()
    if product is None:
        return Response({'error': 'produit introuvable'}, status=http_status.HTTP_404_NOT_FOUND)
    # Les catégories OFF vont du plus général au plus précis : on part de la plus précise
    categories = [c.lower() for c in parse_tags(product.categories_tags)]
    found, category = [], ''
    for category in reversed(categories[-3:]):
        found = _halal_in_category(portal, category, code)
        if len(found) >= 3:
            break
    payload = {'category': category if found else '', 'products': ProductListSerializer(found, many=True).data}
    cache.set(key, payload, 24 * 3600)
    return Response(payload)


# ─────────────────────────────────────────────
# Signalement d'un statut erroné
# ─────────────────────────────────────────────

@api_view(['POST'])
def report(request):
    body = _json_body(request)
    reasons = {value for value, _ in StatusReport.REASONS}
    if not isinstance(body, dict) or not CODE_RE.match(str(body.get('code', ''))) or body.get('reason') not in reasons:
        return Response({'error': 'code et reason attendus'}, status=http_status.HTTP_400_BAD_REQUEST)
    if _rate_limited(request, 'report', 10):
        return Response({'error': 'trop de signalements'}, status=http_status.HTTP_429_TOO_MANY_REQUESTS)
    portal = _portal(request)
    product = Product.objects.filter(portal=portal, code=body['code']).only('halal_status').first()
    StatusReport.objects.create(
        portal=portal, code=body['code'], reason=body['reason'],
        message=str(body.get('message') or '')[:1000],
        status_shown=product.halal_status if product else '',
    )
    return Response({'ok': True}, status=http_status.HTTP_201_CREATED)


# ─────────────────────────────────────────────
# Défi de la semaine
# ─────────────────────────────────────────────

def current_week(today=None):
    year, week, _ = (today or datetime.date.today()).isocalendar()
    return f'{year}-W{week:02d}'


def _challenge_codes(portal, week):
    challenge = WeeklyChallenge.objects.filter(portal=portal, week=week).first()
    if challenge is None:
        codes = list(Product.objects.filter(portal=portal, halal_status=UNKNOWN)
                     .order_by('-unique_scans_n').values_list('code', flat=True)[:CHALLENGE_SIZE])
        challenge, _ = WeeklyChallenge.objects.get_or_create(portal=portal, week=week, defaults={'codes': codes})
    return challenge.codes


@api_view(['GET'])
def challenge(request):
    portal = _portal(request)
    week = current_week()
    key = f'challenge:v1:{portal}:{week}'
    cached = cache.get(key)
    if cached is not None:
        return Response(cached)
    codes = _challenge_codes(portal, week)
    by_code = {p.code: p for p in Product.objects.filter(portal=portal, code__in=codes)}
    products = [by_code[c] for c in codes if c in by_code]
    done = [p for p in products if p.halal_status != UNKNOWN]
    editors = Counter((p.data or {}).get('last_editor') for p in done)
    editors.pop(None, None)
    editors.pop('', None)
    # À compléter d'abord, puis les fiches déjà complétées cette semaine
    ordered = [p for p in products if p.halal_status == UNKNOWN] + done
    payload = {
        'week': week,
        'total': len(products),
        'done': len(done),
        'products': ProductListSerializer(ordered, many=True).data,
        'leaderboard': [{'name': name, 'count': count} for name, count in editors.most_common(10)],
    }
    cache.set(key, payload, 300)
    return Response(payload)


# ─────────────────────────────────────────────
# Partage : page d'aperçu et image
# ─────────────────────────────────────────────

def _product_or_none(portal, code):
    if not CODE_RE.match(code):
        return None
    return Product.objects.filter(portal=portal, code=code).first()


def share_page(request, code):
    """Les robots de WhatsApp / Facebook n'exécutent pas le JavaScript : ils lisent ces balises."""
    portal = _portal(request)
    site = SITES.get(portal, SITES['food'])
    product = _product_or_none(portal, code)
    target = f'/product.html?code={code}' if product else '/'
    if product is None:
        title, description, image = site['name'], '', f"{site['domain']}/assets/images/og-image.png"
    else:
        verdict = classify_product(product)
        name = product.product_name or code
        title = f"{name} — {verdict['label']} | {site['name']}"
        description = verdict['summary']
        image = f"{site['domain']}/proxy/v2/og/{code}.png"
    esc = lambda value: html.escape(str(value), quote=True)  # noqa: E731
    body = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<meta property="og:type" content="product"><meta property="og:site_name" content="{esc(site['name'])}">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}">
<meta property="og:image" content="{esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="{esc(site['domain'] + target)}"><meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="{esc(site['domain'] + target)}">
<meta http-equiv="refresh" content="0;url={esc(target)}">
</head><body><p><a href="{esc(target)}">{esc(title)}</a></p></body></html>"""
    response = HttpResponse(body, content_type='text/html; charset=utf-8')
    response['Cache-Control'] = 'public, max-age=3600'
    return response


def _fetch_image(url, timeout=4):
    if not url.startswith('https://images.open'):
        return None
    try:
        from PIL import Image
        req = urllib.request.Request(url, headers={'User-Agent': 'HalalOpenFoodFacts/1.0'})
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return Image.open(io.BytesIO(response.read())).convert('RGB')
    except Exception:
        return None


def render_og_image(product, portal):
    from pathlib import Path

    from PIL import Image, ImageDraw, ImageFont

    site = SITES.get(portal, SITES['food'])
    font_path = Path(__file__).parent / 'assets' / 'IBMPlexSans.ttf'

    def font(size, weight):
        f = ImageFont.truetype(str(font_path), size)
        try:
            axes = [weight if axis['name'] == b'Weight' else axis['default'] for axis in f.get_variation_axes()]
            f.set_variation_by_axes(axes)
        except Exception:
            pass
        return f

    status = product.halal_status if product.halal_status in STATUS_COLORS else UNKNOWN
    image = Image.new('RGB', (1200, 630), (247, 243, 234))
    draw = ImageDraw.Draw(image)
    draw.rectangle([0, 0, 1200, 14], fill=site['accent'])

    # Photo du produit (ou carré neutre) dans un cadre blanc
    draw.rounded_rectangle([48, 62, 488, 582], radius=28, fill=(255, 255, 255))
    photo = _fetch_image(product.image_front_url or product.image_front_small_url or '')
    if photo is not None:
        photo.thumbnail((400, 480))
        image.paste(photo, (268 - photo.width // 2, 322 - photo.height // 2))
    else:
        draw.text((268, 322), '?', font=font(160, 700), fill=(203, 191, 165), anchor='mm')

    x = 540
    draw.text((x, 70), site['name'], font=font(30, 600), fill=site['accent'])
    name = product.product_name or product.code
    lines, current = [], ''
    title_font = font(56, 700)
    for word in name.split():
        trial = f'{current} {word}'.strip()
        if draw.textlength(trial, font=title_font) <= 610:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    if len(lines) > 3:
        lines = lines[:3]
        lines[-1] = lines[-1][:max(0, len(lines[-1]) - 1)] + '…'
    y = 130
    for line in lines:
        draw.text((x, y), line, font=title_font, fill=(22, 32, 28))
        y += 68
    brands = (product.brands or '').split(',')[0].strip()
    if brands:
        draw.text((x, y + 6), brands[:40], font=font(32, 400), fill=(68, 83, 75))

    label = STATUS_LABEL[status]
    pill_font = font(46, 700)
    width = int(draw.textlength(label, font=pill_font)) + 80
    draw.rounded_rectangle([x, 440, x + width, 520], radius=40, fill=STATUS_COLORS[status])
    draw.text((x + width // 2, 480), label, font=pill_font, fill=(255, 255, 255), anchor='mm')
    draw.text((x, 556), site['domain'].removeprefix('https://'), font=font(28, 400), fill=(95, 108, 101))

    buffer = io.BytesIO()
    image.save(buffer, 'PNG', optimize=True)
    return buffer.getvalue()


def og_image(request, code):
    code = code.removesuffix('.png')
    portal = _portal(request)
    product = _product_or_none(portal, code)
    if product is None:
        return HttpResponse(status=404)
    key = f'og:v1:{portal}:{code}:{product.halal_status}:{product.last_modified_t}'
    png = cache.get(key)
    if png is None:
        png = render_og_image(product, portal)
        cache.set(key, png, 7 * 24 * 3600)
    response = HttpResponse(png, content_type='image/png')
    response['Cache-Control'] = 'public, max-age=86400'
    return response
