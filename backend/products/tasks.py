"""Tâches Celery pour la synchronisation automatique des deltas OFF"""
from celery import shared_task
from django.core.cache import cache
from django.core.management import call_command

# Les fichiers delta OFF sont journaliers : la commande reprend automatiquement
# depuis le dernier fichier appliqué (watermark), il suffit de la lancer régulièrement.
# (Avant : hours=2 sur des fichiers journaliers → aucun fichier n'était jamais trouvé.)

LOCK_TTL = 6 * 3600  # sécurité : le verrou expire même si le worker meurt


def _run_locked(portal: str):
    """Empêche deux synchronisations simultanées du même portail (verrou Redis)."""
    lock_key = f'lock:sync_delta:{portal}'
    if not cache.add(lock_key, '1', LOCK_TTL):
        return f'{portal}: sync déjà en cours, ignorée'
    try:
        call_command('sync_delta', portal=portal)
    finally:
        cache.delete(lock_key)
    # Les compteurs (stats/facets) changent après une sync : recalcul en arrière-plan
    refresh_stats.delay(portal)
    return f'{portal}: ok'


@shared_task(name='sync_food_delta')
def sync_food_delta():
    return _run_locked('food')


@shared_task(name='sync_beauty_delta')
def sync_beauty_delta():
    return _run_locked('beauty')


@shared_task(name='refresh_stats')
def refresh_stats(portal=None):
    """Pré-calcule stats + facets (lues ensuite par /api/stats et /api/facets/*)."""
    from .stats import PORTALS, refresh_portal

    done = []
    for p in ([portal] if portal else PORTALS):
        lock_key = f'lock:refresh_stats:{p}'
        if not cache.add(lock_key, '1', 3600):
            done.append(f'{p}: déjà en cours')
            continue
        try:
            data = refresh_portal(p)
            done.append(f"{p}: {data['total']} produits")
        finally:
            cache.delete(lock_key)
    return ', '.join(done)


IMAGE_RETRY_TTL = 7 * 24 * 3600   # un produit sans photo chez OFF n'est redemandé qu'une fois par semaine
IMAGE_REQUEST_DELAY = 1.5         # OFF renvoie des 429 bien avant la limite annoncée de 100 req/min
IMAGE_PAUSE_KEY = 'img:off-pause'
IMAGE_PAUSE_TTL = 120             # après un 429, plus aucune requête pendant 2 min
IMAGE_LOCK_KEY = 'lock:fill_missing_images'


def image_queue_key(portal, code):
    return f'img:queued:v2:{portal}:{code}'


@shared_task(name='fill_missing_images')
def fill_missing_images(portal, codes):
    """Récupère auprès d'OFF la photo des produits affichés sans image et l'enregistre.

    Une seule tâche à la fois, pour respecter le débit toléré par OFF. Les produits
    non traités (OFF saturé, tâche déjà en cours, erreur réseau) sont libérés :
    ils seront redemandés au prochain affichage.
    """
    import time
    import urllib.error

    from .images import fetch_front_images
    from .models import Product

    codes = list(codes[:50])
    if cache.get(IMAGE_PAUSE_KEY) or not cache.add(IMAGE_LOCK_KEY, '1', 600):
        cache.delete_many([image_queue_key(portal, c) for c in codes])
        return f'{portal}: reporté ({len(codes)} produits)'

    filled, done = 0, 0
    try:
        for code in codes:
            try:
                small, full = fetch_front_images(code, portal)
            except urllib.error.HTTPError as error:
                if error.code == 429:
                    cache.set(IMAGE_PAUSE_KEY, '1', IMAGE_PAUSE_TTL)
                    break
                cache.delete(image_queue_key(portal, code))
                done += 1
                continue
            except Exception:
                cache.delete(image_queue_key(portal, code))
                done += 1
                continue
            finally:
                time.sleep(IMAGE_REQUEST_DELAY)
            done += 1
            if small or full:
                filled += Product.objects.filter(portal=portal, code=code).update(
                    image_front_small_url=small or full, image_front_url=full or small)
    finally:
        cache.delete(IMAGE_LOCK_KEY)
        cache.delete_many([image_queue_key(portal, c) for c in codes[done:]])
    return f'{portal}: {filled}/{len(codes)} images'
