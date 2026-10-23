"""
Espace de gestion privé : /gestion/ (relayé par le nginx de halalopenfoodfacts.org).

Pages rendues côté serveur, sans JavaScript : graphiques en HTML/CSS et SVG, info-bulles
natives (attribut title), tableau de données sous chaque graphique.
"""
import csv
import datetime
from urllib.parse import urlencode

from django.conf import settings
from django.core.paginator import Paginator
from django.db.models import Count, Sum
from django.http import StreamingHttpResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from products.models import Product

from . import audit, auth, charts, metrics
from .countries import country_label
from .models import AuditLog, PageHit, SearchTerm, SystemSample

DEVICES = {'mobile': 'Mobile', 'tablet': 'Tablette', 'desktop': 'Ordinateur'}
PORTAL_LABELS = {'tous': 'Les deux portails', 'food': 'Food', 'beauty': 'Beauty'}
PAGE_LABELS = {
    '/': 'Accueil', '/product.html': 'Fiche produit', '/catalogue.html': 'Catalogue',
    '/excluded.html': 'Produits exclus', '/a-completer.html': 'À compléter', '/compare.html': 'Comparateur',
    '/my-lists.html': 'Mes listes', '/learn.html': 'Guide', '/blog.html': 'Blog', '/dashboard.html': 'Tableau de bord',
}
SITES = {'food': 'https://halalopenfoodfacts.org', 'beauty': 'https://halalopenbeautyfacts.org'}
AUDIT_PAGE_SIZE = 50


def _choice(request, name, allowed, default):
    value = request.GET.get(name, default)
    return value if value in allowed else default


def _top(rows, key, label=lambda value: value, limit=10):
    rows = list(rows[:limit])
    total = max((row['n'] for row in rows), default=0)
    return [{'label': label(row[key]), 'value': row['n'], 'pct': charts.pct(row['n'], total)} for row in rows]


# ─────────────────────────────────────────────
# Connexion
# ─────────────────────────────────────────────

@auth.admin_page
def login(request):
    if request.session.get(auth.SESSION_FLAG):
        return redirect('adminpanel:visits')
    # IP bloquée (trop de codes faux) : retour direct à l'accueil, formulaire non affiché
    if request.method == 'GET' and auth.is_blocked(request):
        return redirect(settings.ADMIN_EXIT_URL)
    error = 'Session expirée après 30 minutes d\'inactivité. Reconnectez-vous.' if request.GET.get('expire') else ''
    status = 200
    if request.method == 'POST':
        outcome = auth.attempt_login(request, request.POST.get('code', ''))
        if outcome == 'ok':
            return redirect('adminpanel:visits')
        if outcome == 'blocked':
            return redirect(settings.ADMIN_EXIT_URL)
        left = auth.remaining_attempts(request)
        error, status = f'Code incorrect. Il vous reste {left} essai{"s" if left > 1 else ""}, ensuite retour à l\'accueil.', 403
    return render(request, 'adminpanel/login.html', {'error': error}, status=status)


@require_POST
@auth.admin_page
def logout(request):
    auth.logout(request)
    return redirect('adminpanel:login')


@auth.admin_required
def home(request):
    return redirect('adminpanel:visits')


# ─────────────────────────────────────────────
# Visites
# ─────────────────────────────────────────────

@auth.admin_required
def visits(request):
    days = int(_choice(request, 'jours', ('7', '30'), '7'))
    portal = _choice(request, 'portail', tuple(PORTAL_LABELS), 'tous')
    today = timezone.localdate()
    start = today - datetime.timedelta(days=days - 1)
    hits = PageHit.objects.filter(day__gte=start)
    terms = SearchTerm.objects.filter(day__gte=start)
    if portal != 'tous':
        hits, terms = hits.filter(portal=portal), terms.filter(portal=portal)

    by_day = {row['day']: row for row in hits.values('day').annotate(views=Count('id'), visitors=Count('visitor', distinct=True))}
    series = [(start + datetime.timedelta(days=i)) for i in range(days)]
    daily = [{'day': d, 'visitors': by_day.get(d, {}).get('visitors', 0), 'views': by_day.get(d, {}).get('views', 0)} for d in series]

    products = list(hits.exclude(product_code='').values('portal', 'product_code').annotate(n=Count('id')).order_by('-n')[:10])
    names = {}
    for p in {row['portal'] for row in products}:
        codes = [row['product_code'] for row in products if row['portal'] == p]
        names.update({(p, code): name for code, name in
                      Product.objects.filter(portal=p, code__in=codes).values_list('code', 'product_name')})
    most = max((row['n'] for row in products), default=0)
    top_products = [{
        'label': (names.get((row['portal'], row['product_code'])) or row['product_code'])
                 + (f" · {row['portal']}" if portal == 'tous' else ''),
        'value': row['n'], 'pct': charts.pct(row['n'], most),
        'href': f"{SITES[row['portal']]}/product.html?code={row['product_code']}",
    } for row in products]

    context = {
        'section': 'visits', 'days': days, 'portal': portal, 'portal_labels': PORTAL_LABELS,
        'today': daily[-1],
        'avg_visitors': round(sum(d['visitors'] for d in daily) / days),
        'total_views': sum(d['views'] for d in daily),
        'visitors_chart': charts.columns(daily, 'visitors', 'visiteurs'),
        'views_chart': charts.columns(daily, 'views', 'pages vues'),
        'daily': reversed(daily),
        'top_pages': _top(hits.values('path').annotate(n=Count('id')).order_by('-n'), 'path',
                          lambda path: PAGE_LABELS.get(path, path)),
        'top_products': top_products,
        'top_searches': _top(terms.values('term').annotate(n=Sum('count')).order_by('-n'), 'term'),
        'devices': _top(hits.values('device').annotate(n=Count('visitor', distinct=True)).order_by('-n'), 'device',
                        lambda device: DEVICES.get(device, device)),
        'countries': _top(hits.exclude(country='').values('country').annotate(n=Count('visitor', distinct=True)).order_by('-n'),
                          'country', country_label),
    }
    return render(request, 'adminpanel/visits.html', context)


# ─────────────────────────────────────────────
# Système
# ─────────────────────────────────────────────

def _rate(part, whole):
    return round(100 * part / whole, 2) if whole else None


@auth.admin_required
def system(request):
    days = int(_choice(request, 'jours', ('1', '3', '7'), '1'))
    now = timezone.now()
    samples = list(SystemSample.objects.filter(created_at__gte=now - datetime.timedelta(days=days)).order_by('created_at'))
    for s in samples:
        s.error_5xx_rate = _rate(s.errors_5xx, s.requests)
        s.error_4xx_rate = _rate(s.errors_4xx, s.requests)

    last = samples[-1] if samples else None
    hour = [s for s in samples if s.created_at >= now - datetime.timedelta(hours=1)]
    requests_hour = sum(s.requests for s in hour)
    api_times = [s.api_avg_response_ms for s in hour if s.api_avg_response_ms is not None]
    api_avg = round(sum(api_times) / len(api_times)) if api_times else None
    rate_5xx = _rate(sum(s.errors_5xx for s in hour), requests_hour)
    rate_4xx = _rate(sum(s.errors_4xx for s in hour), requests_hour)

    def tile(label, metric, value, display, sub=''):
        return {'label': label, 'level': metrics.level(metric, value) if metric else 'none',
                'display': display if value is not None else '—', 'sub': sub}

    tiles = []
    if last:
        tiles = [
            tile('Processeur', 'cpu_percent', last.cpu_percent, f'{last.cpu_percent} %', f'charge {last.load1}'),
            tile('Mémoire', 'mem_percent', last.mem_percent, f'{last.mem_percent} %',
                 f'{last.mem_used_mb or 0:,} / {last.mem_total_mb or 0:,} Mo'.replace(',', ' ')),
            tile('Disque', 'disk_percent', last.disk_percent, f'{last.disk_percent} %', f'{last.disk_used_gb} / {last.disk_total_gb} Go'),
            tile('Base de données', None, last.db_size_mb, f'{(last.db_size_mb or 0) / 1024:.1f} Go', 'PostgreSQL'),
            tile('Réponse API (1 h)', 'api_avg_response_ms', api_avg, f'{api_avg} ms', 'moyenne /proxy/*'),
            tile('Erreurs 5xx (1 h)', 'error_5xx_rate', rate_5xx, f'{rate_5xx} %',
                 f'4xx : {rate_4xx if rate_4xx is not None else "—"} % · {requests_hour} requêtes'),
        ]

    bucket = {1: 5, 3: 15, 7: 30}[days]
    th = metrics.THRESHOLDS
    context = {
        'section': 'system', 'days': days, 'tiles': tiles, 'last': last,
        'charts': [
            charts.line(samples, 'cpu_percent', 'Processeur', '%', bucket, fixed_max=100, thresholds=th['cpu_percent']),
            charts.line(samples, 'mem_percent', 'Mémoire', '%', bucket, fixed_max=100, thresholds=th['mem_percent']),
            charts.line(samples, 'disk_percent', 'Disque', '%', bucket, fixed_max=100, thresholds=th['disk_percent']),
            charts.line(samples, 'api_avg_response_ms', 'Temps de réponse moyen de l\'API', 'ms', bucket,
                        thresholds=th['api_avg_response_ms']),
            charts.line(samples, 'error_5xx_rate', 'Taux d\'erreurs 5xx', '%', bucket, thresholds=th['error_5xx_rate']),
            charts.line(samples, 'error_4xx_rate', 'Taux d\'erreurs 4xx (pages introuvables, robots…)', '%', bucket),
            charts.line(samples, 'db_size_mb', 'Taille de la base', 'Mo', bucket),
        ],
        'has_logs': any(s.requests for s in samples),
    }
    return render(request, 'adminpanel/system.html', context)


# ─────────────────────────────────────────────
# Journal d'audit
# ─────────────────────────────────────────────

def _parse_date(value):
    try:
        return datetime.date.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def _audit_filters(request):
    start, end = _parse_date(request.GET.get('debut')), _parse_date(request.GET.get('fin'))
    action = _choice(request, 'action', tuple(audit.ACTIONS), '')
    result = _choice(request, 'resultat', tuple(dict(AuditLog.RESULTS)), '')
    qs = AuditLog.objects.all()
    tz = timezone.get_current_timezone()
    if start:
        qs = qs.filter(created_at__gte=datetime.datetime.combine(start, datetime.time.min, tz))
    if end:
        qs = qs.filter(created_at__lt=datetime.datetime.combine(end + datetime.timedelta(days=1), datetime.time.min, tz))
    if action:
        qs = qs.filter(action=action)
    if result:
        qs = qs.filter(result=result)
    return qs, {'debut': start.isoformat() if start else '', 'fin': end.isoformat() if end else '',
                'action': action, 'resultat': result}


@auth.admin_required
def audit_log(request):
    qs, filters = _audit_filters(request)
    page = Paginator(qs, AUDIT_PAGE_SIZE).get_page(request.GET.get('page'))
    query = urlencode({k: v for k, v in filters.items() if v})
    return render(request, 'adminpanel/audit.html', {
        'section': 'audit', 'page': page, 'filters': filters, 'query': query,
        'actions': audit.ACTIONS, 'results': AuditLog.RESULTS,
    })


class _Echo:
    def write(self, value):
        return value


def csv_safe(value):
    """Empêche l'injection de formules dans un tableur (=, +, -, @ en tête de cellule)."""
    value = str(value)
    return "'" + value if value[:1] in ('=', '+', '-', '@', '\t', '\r') else value


@auth.admin_required
def audit_csv(request):
    qs, filters = _audit_filters(request)
    audit.record('audit.export', request=request, detail=str({k: v for k, v in filters.items() if v}))
    writer = csv.writer(_Echo(), delimiter=';')
    tz = timezone.get_current_timezone()

    def rows():
        yield '﻿' + writer.writerow(['date', 'action', 'libellé', 'acteur', 'cible', 'résultat', 'ip_hachée', 'détail'])
        for e in qs.iterator(chunk_size=2000):
            yield writer.writerow([csv_safe(v) for v in (
                e.created_at.astimezone(tz).strftime('%Y-%m-%d %H:%M:%S'), e.action, audit.ACTIONS.get(e.action, ''),
                e.actor, e.target, e.get_result_display(), e.ip_hash, e.detail)])

    response = StreamingHttpResponse(rows(), content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="journal-audit-{timezone.localdate()}.csv"'
    return response
