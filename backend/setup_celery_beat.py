"""
Script de setup initial : crée les tâches Celery Beat dans la base.
À lancer une seule fois après le premier deploy :
  docker compose exec django python setup_celery_beat.py
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django_celery_beat.models import PeriodicTask, IntervalSchedule

# Toutes les heures
schedule_hourly, _ = IntervalSchedule.objects.get_or_create(
    every=1, period=IntervalSchedule.HOURS
)

# Toutes les 6 heures
schedule_6h, _ = IntervalSchedule.objects.get_or_create(
    every=6, period=IntervalSchedule.HOURS
)

tasks = [
    ('sync-food-delta',   'sync_food_delta',   schedule_hourly, 'Sync delta Food OFF toutes les heures'),
    ('sync-beauty-delta', 'sync_beauty_delta', schedule_6h,     'Sync delta Beauty OFF toutes les 6h'),
]

for name, task, schedule, desc in tasks:
    obj, created = PeriodicTask.objects.update_or_create(
        name=name,
        defaults={
            'interval': schedule,
            'task': task,
            'enabled': True,
            'description': desc,
        }
    )
    status = 'créé' if created else 'mis à jour'
    print(f'  ✅ Tâche "{name}" {status}')

print('\n✅ Celery Beat configuré. Les syncs démarreront automatiquement.')
