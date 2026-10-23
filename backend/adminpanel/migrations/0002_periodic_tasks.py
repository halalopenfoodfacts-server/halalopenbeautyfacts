"""Tâches planifiées de l'espace de gestion dans Celery Beat (planificateur en base)."""
from django.db import migrations
from django.utils import timezone

TASKS = [
    # (nom, tâche, description)
    ('collect-system-sample', 'collect_system_sample', 'Relevé CPU / mémoire / disque / base / nginx toutes les 5 min'),
    ('purge-admin-data', 'purge_admin_data', 'Purge audience (90 j), relevés (30 j), sessions expirées — chaque nuit'),
]


def create_tasks(apps, schema_editor):
    IntervalSchedule = apps.get_model('django_celery_beat', 'IntervalSchedule')
    CrontabSchedule = apps.get_model('django_celery_beat', 'CrontabSchedule')
    PeriodicTask = apps.get_model('django_celery_beat', 'PeriodicTask')
    every_5_min, _ = IntervalSchedule.objects.get_or_create(every=5, period='minutes')
    nightly, _ = CrontabSchedule.objects.get_or_create(
        minute='30', hour='3', day_of_week='*', day_of_month='*', month_of_year='*', timezone='Europe/Paris')
    for (name, task, description), schedule in zip(TASKS, ({'interval': every_5_min}, {'crontab': nightly})):
        PeriodicTask.objects.update_or_create(
            name=name, defaults={'task': task, 'enabled': True, 'description': description, **schedule})
    # Les signaux ne partent pas depuis une migration : prévenir Celery Beat à la main
    apps.get_model('django_celery_beat', 'PeriodicTasks').objects.update_or_create(
        ident=1, defaults={'last_update': timezone.now()})


def delete_tasks(apps, schema_editor):
    apps.get_model('django_celery_beat', 'PeriodicTask').objects.filter(name__in=[t[0] for t in TASKS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('adminpanel', '0001_initial'),
        ('django_celery_beat', '0018_improve_crontab_helptext'),
    ]

    operations = [migrations.RunPython(create_tasks, delete_tasks)]
