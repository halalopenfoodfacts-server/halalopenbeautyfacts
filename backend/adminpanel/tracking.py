"""
Mesure d'audience sans cookie (exemptée de consentement selon les critères de la CNIL).

    POST /api/v2/hit   {"p": "/product.html?code=…", "tz": "Europe/Paris"}   → 204

- Visiteur : empreinte sha256(sel du jour + IP + navigateur), tronquée. Le sel est aléatoire,
  gardé dans Redis 48 h au plus, jamais en base : impossible de relier deux journées
  ou de retrouver une IP.
- Pays : déduit du fuseau horaire du navigateur (aucune géolocalisation par IP).
- Les navigateurs qui envoient Do Not Track / Global Privacy Control ne sont pas comptés
  (le script ne s'exécute pas, et l'API ignore aussi l'en-tête Sec-GPC).
"""
import datetime
import hashlib
import json
import re
import secrets
from functools import lru_cache
from urllib.parse import parse_qs, urlsplit

from django.core.cache import cache
from django.db import connection
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .audit import client_ip
from .models import PageHit

PORTALS = ('food', 'beauty')
LANG_PREFIX = re.compile(r'^/(en|ar|es)(?=/|$)')
PATH_RE = re.compile(r'^/[\w\-./]{0,199}$')
CODE_RE = re.compile(r'^[0-9A-Za-z_-]{1,64}$')
BOT_RE = re.compile(r'bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|python|curl|wget', re.I)
TABLET_RE = re.compile(r'iPad|Tablet|PlayBook|Silk|Android(?!.*Mobi)', re.I)
MOBILE_RE = re.compile(r'Mobi|iPhone|iPod|Android|Windows Phone', re.I)
HITS_PER_HOUR = 600
ZONE_TAB = '/usr/share/zoneinfo/zone.tab'


def daily_salt(day):
    key = f'adminpanel:salt:{day.isoformat()}'
    cache.add(key, secrets.token_hex(16), 48 * 3600)
    return cache.get(key)


def visitor_hash(request, day):
    raw = f"{daily_salt(day)}|{client_ip(request)}|{request.headers.get('User-Agent', '')}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def device_of(user_agent):
    if TABLET_RE.search(user_agent):
        return 'tablet'
    return 'mobile' if MOBILE_RE.search(user_agent) else 'desktop'


@lru_cache(maxsize=1)
def _zones():
    zones = {}
    try:
        with open(ZONE_TAB, encoding='utf-8') as fh:
            for line in fh:
                if not line.startswith('#'):
                    parts = line.split('\t')
                    if len(parts) >= 3:
                        zones[parts[2].strip()] = parts[0]
    except OSError:
        pass
    return zones


def country_of(tz):
    return _zones().get(tz, '') if isinstance(tz, str) and len(tz) < 64 else ''


def split_page(value):
    """« /en/product.html?code=123 » → ('/product.html', '123')."""
    parts = urlsplit(value if isinstance(value, str) else '')
    path = LANG_PREFIX.sub('', parts.path) or '/'
    if not PATH_RE.match(path):
        return None, ''
    if path.endswith('/index.html'):
        path = path[:-len('index.html')]
    code = (parse_qs(parts.query).get('code') or [''])[0]
    return path, code if CODE_RE.match(code) else ''


def _over_limit(request):
    key = f'adminpanel:hits:{hashlib.sha256(client_ip(request).encode()).hexdigest()[:16]}'
    if cache.add(key, 1, 3600):
        return False
    try:
        return cache.incr(key) > HITS_PER_HOUR
    except ValueError:
        return False


@csrf_exempt
@require_POST
def hit(request):
    user_agent = request.headers.get('User-Agent', '')
    if request.headers.get('Sec-GPC') == '1' or not user_agent or BOT_RE.search(user_agent):
        return HttpResponse(status=204)
    try:
        body = json.loads(request.body[:2000] or b'{}')
    except (ValueError, UnicodeDecodeError):
        return HttpResponse(status=400)
    if not isinstance(body, dict):
        return HttpResponse(status=400)
    path, code = split_page(body.get('p'))
    if path is None:
        return HttpResponse(status=400)
    if _over_limit(request):
        return HttpResponse(status=204)
    portal = request.headers.get('X-Portal', 'food')
    day = timezone.localdate()
    PageHit.objects.create(
        day=day, portal=portal if portal in PORTALS else 'food', path=path, product_code=code,
        visitor=visitor_hash(request, day), device=device_of(user_agent), country=country_of(body.get('tz')),
    )
    return HttpResponse(status=204)


def normalize_term(q):
    return ' '.join(q.lower().split())[:100]


def record_search(request, portal, q):
    """Compte un terme recherché (une fois par visiteur, terme et jour). N'échoue jamais."""
    term = normalize_term(q)
    if len(term) < 2 or BOT_RE.search(request.headers.get('User-Agent', '')):
        return
    try:
        day = timezone.localdate()
        seen = f'adminpanel:st:{visitor_hash(request, day)}:{hashlib.sha256(term.encode()).hexdigest()[:16]}'
        if not cache.add(seen, 1, 24 * 3600):
            return
        with connection.cursor() as cursor:
            cursor.execute(
                'INSERT INTO adminpanel_searchterm (day, portal, term, count) VALUES (%s, %s, %s, 1) '
                'ON CONFLICT (day, portal, term) DO UPDATE SET count = adminpanel_searchterm.count + 1',
                [day, portal, term])
    except Exception:
        pass


def purge_before(day: datetime.date):
    """Supprime les mesures antérieures à `day` (DELETE direct : ni signal ni cascade)."""
    from .models import SearchTerm
    hits, _ = PageHit.objects.filter(day__lt=day).delete()
    terms, _ = SearchTerm.objects.filter(day__lt=day).delete()
    return hits, terms
