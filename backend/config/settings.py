import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-halal-change-in-production-xyz123')
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', '*').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'django.contrib.postgres',
    'rest_framework',
    'corsheaders',
    'django_celery_beat',
    'products.apps.ProductsConfig',
    'adminpanel.apps.AdminPanelConfig',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'adminpanel.audit.AuditContextMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB', 'halaldb'),
        'USER': os.environ.get('POSTGRES_USER', 'halal'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'halal_secret'),
        'HOST': os.environ.get('POSTGRES_HOST', 'postgres'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        'OPTIONS': {
            'connect_timeout': 10,
            # Garde-fou du service web (0 = illimité, valeur des workers Celery : sync et stats sont longues)
            'options': f"-c statement_timeout={os.environ.get('DB_STATEMENT_TIMEOUT_MS', '0')}",
        },
    }
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.environ.get('REDIS_URL', 'redis://redis:6379/0'),
        'TIMEOUT': 300,  # 5 minutes
    }
}

# Celery
CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_TIMEZONE = 'Europe/Paris'

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': ['rest_framework.renderers.JSONRenderer'],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 24,
}

CORS_ALLOW_ALL_ORIGINS = True
CORS_URLS_REGEX = r'^/(api|search)/'   # jamais sur l'espace de gestion
CORS_ALLOW_METHODS = ['GET', 'OPTIONS']

LANGUAGE_CODE = 'fr-fr'
TIME_ZONE = 'Europe/Paris'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─────────────────────────────────────────
# Espace de gestion privé (/gestion/, app adminpanel)
# ─────────────────────────────────────────
# Hash argon2 du code d'accès : python manage.py admin_code_hash. Vide = espace désactivé (404).
ADMIN_CODE_HASH = os.environ.get('ADMIN_CODE_HASH', '')
ADMIN_IDLE_SECONDS = 30 * 60          # session fermée après 30 min sans activité
ADMIN_MAX_ATTEMPTS = 5                # échecs par IP avant blocage…
ADMIN_LOCKOUT_SECONDS = 15 * 60       # … de 15 min
ADMIN_GLOBAL_MAX_FAILURES = 30        # échecs par heure toutes IP confondues → blocage global

ANALYTICS_RETENTION_DAYS = 90         # pages vues et termes recherchés
METRICS_RETENTION_DAYS = 30           # relevés système
METRICS_DISK_PATH = os.environ.get('METRICS_DISK_PATH', '/')
NGINX_ACCESS_LOGS = [p for p in os.environ.get('NGINX_ACCESS_LOGS', '').split(',') if p]

# Derrière le nginx de l'hôte (HTTPS) ; Django n'écoute que sur 127.0.0.1
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
CSRF_TRUSTED_ORIGINS = ['https://halalopenfoodfacts.org', 'https://www.halalopenfoodfacts.org']
SESSION_COOKIE_NAME = 'hof_sid'
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Strict'
SESSION_COOKIE_AGE = ADMIN_IDLE_SECONDS   # renouvelé à chaque page (session modifiée)
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = 'Strict'
