"""
Accès à l'espace de gestion : un code secret unique, vérifié contre un hash argon2.

    ADMIN_CODE_HASH (variable d'environnement) : hash produit par `manage.py admin_code_hash`.
    Sans hash, l'espace de gestion n'existe pas (404 partout).

Limitation des essais (Redis) : ADMIN_MAX_ATTEMPTS échecs par IP → retour à l'accueil (ADMIN_EXIT_URL)
et IP bloquée ADMIN_LOCKOUT_SECONDS ;
au-delà de ADMIN_GLOBAL_MAX_FAILURES échecs par heure, toutes IP confondues, plus aucune
tentative n'est examinée pendant ADMIN_LOCKOUT_SECONDS (attaque répartie).
Débloquer : `manage.py admin_unlock`.
"""
import functools
import time

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from django.conf import settings
from django.core.cache import cache
from django.http import Http404
from django.shortcuts import redirect

from . import audit

SESSION_FLAG = 'adminpanel:auth'
SESSION_SEEN = 'adminpanel:seen'
GLOBAL_KEY = 'adminpanel:fail:global'
GLOBAL_BLOCK_KEY = 'adminpanel:block:global'

_hasher = PasswordHasher()


def enabled():
    return bool(settings.ADMIN_CODE_HASH)


def code_matches(code):
    try:
        return _hasher.verify(settings.ADMIN_CODE_HASH, code)
    except (VerificationError, InvalidHashError):
        return False


def _keys(request):
    ip = audit.hash_ip(audit.client_ip(request)) or 'unknown'
    return f'adminpanel:fail:{ip}', f'adminpanel:block:{ip}'


def _incr(key, ttl):
    if cache.add(key, 1, ttl):
        return 1
    try:
        return cache.incr(key)
    except ValueError:   # clé expirée entre add et incr
        cache.add(key, 1, ttl)
        return 1


def is_blocked(request):
    return bool(cache.get(GLOBAL_BLOCK_KEY) or cache.get(_keys(request)[1]))


def remaining_attempts(request):
    return max(settings.ADMIN_MAX_ATTEMPTS - (cache.get(_keys(request)[0]) or 0), 0)


def attempt_login(request, code):
    """Vérifie le code et ouvre la session. Renvoie 'ok', 'invalid' ou 'blocked'."""
    if is_blocked(request):
        audit.record('login.blocked', result='blocked', request=request)
        return 'blocked'
    if code and code_matches(code.strip()):
        cache.delete(_keys(request)[0])
        request.session.cycle_key()   # nouvelle clé de session : pas de fixation de session
        request.session[SESSION_FLAG] = True
        request.session[SESSION_SEEN] = int(time.time())
        audit.record('login.success', request=request)
        return 'ok'

    lockout = settings.ADMIN_LOCKOUT_SECONDS
    fail_key, block_key = _keys(request)
    failures = _incr(fail_key, lockout)
    if failures >= settings.ADMIN_MAX_ATTEMPTS:
        cache.set(block_key, 1, lockout)
        cache.delete(fail_key)
    if _incr(GLOBAL_KEY, 3600) >= settings.ADMIN_GLOBAL_MAX_FAILURES:
        cache.set(GLOBAL_BLOCK_KEY, 1, lockout)
        cache.delete(GLOBAL_KEY)
    audit.record('login.failure', result='failure', request=request, detail=f'essai {failures}/{settings.ADMIN_MAX_ATTEMPTS}')
    return 'blocked' if is_blocked(request) else 'invalid'


def logout(request, reason='logout'):
    if request.session.get(SESSION_FLAG):
        audit.record(reason, request=request)
    request.session.flush()


def unlock_all():
    """Lève tous les blocages (par IP et global). Renvoie le nombre de clés supprimées."""
    cache.delete_many([GLOBAL_KEY, GLOBAL_BLOCK_KEY])
    backend = getattr(cache, '_cache', None)
    if not hasattr(backend, 'get_client'):   # cache non Redis (tests)
        return 0
    client = backend.get_client(write=True)
    keys = [*client.scan_iter(match=cache.make_key('adminpanel:block:*')),
            *client.scan_iter(match=cache.make_key('adminpanel:fail:*'))]
    return client.delete(*keys) if keys else 0


def protect(response):
    """En-têtes communs à toutes les pages de gestion."""
    response['X-Robots-Tag'] = 'noindex, nofollow, noarchive'
    response['Cache-Control'] = 'no-store'
    # same-origin et non no-referrer : avec no-referrer, le navigateur envoie « Origin: null »
    # et la protection CSRF de Django refuse le formulaire de connexion (403).
    response['Referrer-Policy'] = 'same-origin'
    return response


def admin_page(view):
    """Pages de gestion publiques (connexion) : 404 si l'espace est désactivé, en-têtes noindex."""
    @functools.wraps(view)
    def wrapper(request, *args, **kwargs):
        if not enabled():
            raise Http404
        return protect(view(request, *args, **kwargs))
    return wrapper


def admin_required(view):
    """Session admin exigée ; expiration après ADMIN_IDLE_SECONDS sans activité."""
    @functools.wraps(view)
    def wrapper(request, *args, **kwargs):
        if not request.session.get(SESSION_FLAG):
            return redirect('adminpanel:login')
        now = int(time.time())
        if now - request.session.get(SESSION_SEEN, 0) > settings.ADMIN_IDLE_SECONDS:
            logout(request, 'session.expired')
            return redirect(f"{redirect('adminpanel:login').url}?expire=1")
        request.session[SESSION_SEEN] = now   # session modifiée → cookie renouvelé
        return view(request, *args, **kwargs)
    return admin_page(wrapper)
