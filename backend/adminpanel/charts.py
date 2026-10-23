"""Données prêtes à dessiner pour les gabarits : colonnes HTML/CSS et courbes SVG (sans JavaScript)."""
import datetime
import math

from django.utils import timezone

WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
WIDTH, HEIGHT = 600, 160


def pct(value, total):
    return round(100 * value / total, 1) if total else 0


def fmt(value, decimals=0):
    if value is None:
        return '—'
    text = f'{value:,.{decimals}f}'.replace(',', ' ').replace('.', ',')
    return text


def day_label(day):
    return f'{WEEKDAYS[day.weekday()]} {day.day} {MONTHS[day.month - 1]}'


def columns(daily, key, unit):
    """Histogramme par jour : hauteur relative au maximum, étiquette de jour espacée selon la période."""
    top = max((d[key] for d in daily), default=0)
    step = 1 if len(daily) <= 7 else 5
    last = len(daily) - 1
    return {
        'max': top, 'unit': unit,
        'bars': [{
            'h': pct(d[key], top), 'value': d[key],
            'title': f'{day_label(d["day"])} : {fmt(d[key])} {unit}',
            'label': (WEEKDAYS[d['day'].weekday()] + ' ' if step == 1 else '') + str(d['day'].day)
                     if (last - i) % step == 0 else '',
        } for i, d in enumerate(daily)],
    }


def _nice_max(value):
    if value <= 0:
        return 1
    exponent = 10 ** math.floor(math.log10(value))
    for factor in (1, 2, 2.5, 5, 10):
        if value <= factor * exponent:
            return factor * exponent
    return 10 * exponent


def _buckets(samples, attr, minutes):
    """Moyenne par tranche de `minutes` : [(datetime de début, valeur), …] en ignorant les mesures absentes."""
    size = minutes * 60
    groups = {}
    for s in samples:
        value = getattr(s, attr, None)
        if value is None:
            continue
        key = int(s.created_at.timestamp()) // size * size
        groups.setdefault(key, []).append(value)
    return [(key, sum(v) / len(v)) for key, v in sorted(groups.items())], size


def line(samples, attr, title, unit, bucket_minutes, fixed_max=None, thresholds=None):
    """Courbe SVG (viewBox WIDTH × HEIGHT), coupée sur les trous, avec bandes d'alerte et zones de survol."""
    points, size = _buckets(samples, attr, bucket_minutes)
    chart = {'title': title, 'unit': unit, 'width': WIDTH, 'height': HEIGHT, 'empty': not points}
    if not points:
        return chart
    decimals = 0 if unit in ('Mo', 'ms') else 1
    tz = timezone.get_current_timezone()
    t0, t1 = points[0][0], points[-1][0] + size
    peak = max(value for _, value in points)
    ymax = fixed_max or _nice_max(peak * 1.1)
    x = lambda t: round((t - t0) / (t1 - t0) * WIDTH, 1)  # noqa: E731
    y = lambda v: round(HEIGHT - min(v, ymax) / ymax * HEIGHT, 1)  # noqa: E731

    segments, current, previous = [], [], None
    for t, value in points:
        if previous is not None and t - previous > 2 * size:
            segments.append(current)
            current = []
        current.append(f'{x(t + size / 2)},{y(value)}')
        previous = t
    segments.append(current)

    bands = []
    if thresholds:
        warn, crit = thresholds
        for low, high, level, label in ((warn, crit, 'warn', 'attention'), (crit, None, 'crit', 'critique')):
            if low < ymax:
                top = y(high) if high is not None and high < ymax else 0
                bands.append({'y': top, 'h': round(y(low) - top, 1), 'level': level,
                              'label': f'{label} ≥ {fmt(low)} {unit}', 'line_y': y(low)})

    local = lambda t: datetime.datetime.fromtimestamp(t, tz)  # noqa: E731
    stamp = lambda t: f'{local(t).day} {MONTHS[local(t).month - 1]} {local(t):%H:%M}'  # noqa: E731
    hourly = {}
    for t, value in points:
        hourly.setdefault(t // 3600 * 3600, []).append(value)

    last_value = points[-1][1]
    level = 'ok'
    if thresholds:
        level = 'crit' if last_value >= thresholds[1] else 'warn' if last_value >= thresholds[0] else 'ok'
    chart.update({
        'segments': [' '.join(s) for s in segments if s],
        'bands': bands,
        'hits': [{'x': x(t), 'w': max(round(size / (t1 - t0) * WIDTH, 2), 1),
                  'title': f'{stamp(t)} : {fmt(value, decimals)} {unit}'} for t, value in points],
        'ticks': [{'y': y(v), 'label': fmt(v, 0 if ymax >= 10 else 1)} for v in (ymax, ymax / 2)],
        'x_labels': [stamp(t0), stamp(t1 - size)],
        'last': f'{fmt(last_value, decimals)} {unit}', 'level': level,
        'peak': f'{fmt(peak, decimals)} {unit}',
        'table': [{'hour': stamp(h), 'value': fmt(sum(v) / len(v), decimals)} for h, v in sorted(hourly.items(), reverse=True)],
    })
    return chart
