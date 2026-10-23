"""
Garde-fous de coût : limites par visiteur et plafond de dépense quotidien.

Visiteur = empreinte sha256(sel du jour + IP). Le sel est celui de la mesure d'audience
(adminpanel.tracking.daily_salt : aléatoire, gardé 48 h dans Redis, jamais en base).
"""
import hashlib

from django.conf import settings
from django.core.cache import cache
from django.db.models import Sum
from django.utils import timezone

from adminpanel.audit import client_ip
from adminpanel.tracking import daily_salt


def visitor_key(request):
    day = timezone.localdate()
    return hashlib.sha256(f'{daily_salt(day)}|{client_ip(request)}'.encode()).hexdigest()[:16]


def _incr(key, ttl):
    if cache.add(key, 1, ttl):
        return 1
    try:
        return cache.incr(key)
    except ValueError:
        cache.add(key, 1, ttl)
        return 1


def check_rate(request):
    """Compte la question et renvoie None si elle est acceptée, sinon le message à afficher."""
    visitor = visitor_key(request)
    minute_key = f'assistant:rl:m:{visitor}'   # fenêtre de 60 s ouverte par la première question
    day_key = f'assistant:rl:d:{visitor}:{timezone.localdate()}'
    if (cache.get(day_key) or 0) >= settings.ASSISTANT_MAX_PER_DAY:
        return f"Vous avez posé {settings.ASSISTANT_MAX_PER_DAY} questions aujourd'hui, la limite quotidienne. À demain !"
    if (cache.get(minute_key) or 0) >= settings.ASSISTANT_MAX_PER_MINUTE:
        return 'Trop de questions en peu de temps. Patientez une minute.'
    _incr(minute_key, 60)
    _incr(day_key, 24 * 3600)
    return None


def spent_today():
    from .models import Exchange
    return Exchange.objects.filter(day=timezone.localdate()).aggregate(total=Sum('cost_usd'))['total'] or 0.0


def budget_exhausted():
    return spent_today() >= settings.ASSISTANT_DAILY_BUDGET_USD


def cost_of(usage):
    """Coût estimé en dollars d'après les tarifs configurés (par million de tokens)."""
    price_in, price_out = settings.ASSISTANT_PRICE_INPUT_PER_MTOK, settings.ASSISTANT_PRICE_OUTPUT_PER_MTOK
    return (usage['input_tokens'] * price_in
            + usage['cache_write_tokens'] * price_in * 1.25
            + usage['cache_read_tokens'] * price_in * 0.1
            + usage['output_tokens'] * price_out) / 1_000_000
