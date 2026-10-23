"""Tâches planifiées de l'espace de gestion (créées par la migration 0002 dans Celery Beat)."""
import datetime

from celery import shared_task
from django.conf import settings
from django.contrib.sessions.models import Session
from django.utils import timezone


@shared_task(name='collect_system_sample')
def collect_system_sample():
    from .metrics import collect
    sample = collect()
    return f'cpu {sample.cpu_percent} % · mém {sample.mem_percent} % · {sample.requests} requêtes'


@shared_task(name='purge_admin_data')
def purge_admin_data():
    """Durées de conservation : audience ANALYTICS_RETENTION_DAYS, relevés METRICS_RETENTION_DAYS.

    Le journal d'audit n'est jamais purgé (ajout seul).
    """
    from .models import SystemSample
    from .tracking import purge_before

    today = timezone.localdate()
    # 90 jours gardés = aujourd'hui et les 89 jours précédents
    hits, terms = purge_before(today - datetime.timedelta(days=settings.ANALYTICS_RETENTION_DAYS - 1))
    samples, _ = SystemSample.objects.filter(
        created_at__lt=timezone.now() - datetime.timedelta(days=settings.METRICS_RETENTION_DAYS)).delete()
    sessions, _ = Session.objects.filter(expire_date__lt=timezone.now()).delete()
    return f'{hits} pages vues, {terms} termes, {samples} relevés, {sessions} sessions supprimés'
