from argon2 import PasswordHasher
from django.core.cache import cache
from django.test import TestCase, override_settings

CODE = 'bon-code-secret-2026'
# Paramètres argon2 réduits : les tests restent rapides, la vérification est identique
CODE_HASH = PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1).hash(CODE)
IP = '203.0.113.7'


@override_settings(ADMIN_CODE_HASH=CODE_HASH, ADMIN_MAX_ATTEMPTS=5, ADMIN_GLOBAL_MAX_FAILURES=30)
class AdminTestCase(TestCase):
    def setUp(self):
        cache.clear()

    def login(self, code=CODE, ip=IP, **extra):
        return self.client.post('/gestion/connexion', {'code': code}, HTTP_X_REAL_IP=ip, **extra)
