"""Réglages de test : base PostgreSQL éphémère, cache mémoire, Celery synchrone.

Ne touche jamais au Redis ni au broker de production.
Lancer : bash scripts/test-backend.sh (depuis la racine du monorepo).
"""
from .settings import *  # noqa: F401,F403

CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'
CELERY_TASK_ALWAYS_EAGER = True
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
