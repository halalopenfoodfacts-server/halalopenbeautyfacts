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
    return f'{portal}: ok'


@shared_task(name='sync_food_delta')
def sync_food_delta():
    return _run_locked('food')


@shared_task(name='sync_beauty_delta')
def sync_beauty_delta():
    return _run_locked('beauty')
