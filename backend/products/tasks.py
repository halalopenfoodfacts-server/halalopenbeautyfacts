"""Tâches Celery pour la synchronisation automatique des deltas OFF"""
from celery import shared_task
from django.core.management import call_command


@shared_task(name='sync_food_delta')
def sync_food_delta():
    call_command('sync_delta', portal='food', hours=2)


@shared_task(name='sync_beauty_delta')
def sync_beauty_delta():
    call_command('sync_delta', portal='beauty', hours=2)
