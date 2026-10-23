"""Toute action faite dans l'admin Django (LogEntry) est recopiée dans le journal d'audit."""
from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.db.models.signals import post_save
from django.dispatch import receiver

from . import audit

HALAL_FIELDS = ('is_halal', 'is_excluded', 'labels_tags', 'halal_status', 'ingredients_text')
CONFIG_APPS = ('django_celery_beat', 'auth', 'sites')
VERBS = {ADDITION: 'create', CHANGE: 'update', DELETION: 'delete'}


def action_for(entry):
    app, model = entry.content_type.app_label, entry.content_type.model
    verb = VERBS.get(entry.action_flag, 'update')
    if (app, model) == ('products', 'product'):
        message = entry.get_change_message().lower()
        if verb == 'update' and any(field.replace('_', ' ') in message or field in message for field in HALAL_FIELDS):
            return 'halal_status.update'
        return f'product.{verb}'
    if (app, model) == ('products', 'statusreport'):
        return 'report.delete' if verb == 'delete' else 'report.update'
    if app in CONFIG_APPS:
        return 'config.update'
    return 'admin.change'


@receiver(post_save, sender=LogEntry)
def on_admin_action(sender, instance, created, **kwargs):
    if not created or instance.content_type is None:
        return
    audit.record(
        action_for(instance),
        target=f'{instance.content_type.app_label}.{instance.content_type.model} #{instance.object_id} {instance.object_repr}',
        actor=f'admin-django:{instance.user.get_username()}',
        detail=instance.get_change_message(),
    )
