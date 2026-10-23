import time

from django.test import Client, override_settings

from adminpanel import auth
from adminpanel.audit import hash_ip
from adminpanel.models import AuditLog

from .helpers import CODE, IP, AdminTestCase

PAGES = ['/gestion/', '/gestion/visites', '/gestion/systeme', '/gestion/journal', '/gestion/journal.csv']


@override_settings(ADMIN_CODE_HASH='')
class DisabledTests(AdminTestCase):
    def test_no_hash_means_no_admin_area(self):
        for url in ['/gestion/connexion', *PAGES]:
            self.assertEqual(self.client.get(url).status_code, 404, url)
        self.assertEqual(self.login().status_code, 404)
        self.assertFalse(AuditLog.objects.exists())


class LoginTests(AdminTestCase):
    def test_pages_require_session(self):
        for url in PAGES:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 302, url)
            self.assertEqual(response['Location'], '/gestion/connexion')

    def test_login_page_is_noindex_and_not_cached(self):
        response = self.client.get('/gestion/connexion')
        self.assertEqual(response.status_code, 200)
        self.assertIn('noindex', response['X-Robots-Tag'])
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertContains(response, '<meta name="robots" content="noindex')
        self.assertNotContains(response, CODE)
        self.assertContains(response, 'Accès réservé à l\'administrateur')

    def test_wrong_code_is_refused_and_logged(self):
        response = self.login('mauvais-code')
        self.assertEqual(response.status_code, 403)
        self.assertContains(response, 'Code incorrect', status_code=403)
        self.assertEqual(self.client.get('/gestion/visites').status_code, 302)
        entry = AuditLog.objects.get()
        self.assertEqual((entry.action, entry.result), ('login.failure', 'failure'))
        self.assertEqual(entry.ip_hash, hash_ip(IP))
        self.assertNotIn(IP, entry.ip_hash + entry.detail)

    def test_correct_code_opens_a_secure_session(self):
        self.client.get('/gestion/connexion')
        before = self.client.cookies.get('hof_sid')
        response = self.login()
        self.assertRedirects(response, '/gestion/visites', fetch_redirect_response=False)
        cookie = response.cookies['hof_sid']
        self.assertTrue(cookie['secure'])
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Strict')
        self.assertEqual(int(cookie['max-age']), 30 * 60)
        if before is not None:
            self.assertNotEqual(before.value, cookie.value)
        self.assertEqual(self.client.get('/gestion/visites').status_code, 200)
        self.assertEqual(AuditLog.objects.get().action, 'login.success')

    def test_code_surrounding_spaces_are_ignored(self):
        self.assertEqual(self.login(f'  {CODE} ').status_code, 302)

    def test_browser_form_post_passes_csrf(self):
        """Envoi tel qu'un navigateur le fait en HTTPS : jeton du formulaire + en-tête Origin du site."""
        client = Client(enforce_csrf_checks=True)
        page = client.get('/gestion/connexion', secure=True)
        self.assertEqual(page['Referrer-Policy'], 'same-origin')   # no-referrer → Origin: null → 403
        self.assertNotContains(page, 'no-referrer')
        token = page.context['csrf_token']
        response = client.post('/gestion/connexion', {'code': CODE, 'csrfmiddlewaretoken': str(token)}, secure=True,
                               HTTP_ORIGIN='https://halalopenfoodfacts.org', HTTP_HOST='halalopenfoodfacts.org',
                               HTTP_X_REAL_IP=IP)
        self.assertEqual(response.status_code, 302)
        self.assertTrue(AuditLog.objects.filter(action='login.success').exists())

    def test_csrf_is_enforced(self):
        client = Client(enforce_csrf_checks=True)
        response = client.post('/gestion/connexion', {'code': CODE}, HTTP_X_REAL_IP=IP)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(AuditLog.objects.filter(action='login.success').exists())


class RateLimitTests(AdminTestCase):
    def test_five_failures_block_the_ip_even_with_the_right_code(self):
        for _ in range(4):
            self.assertEqual(self.login('faux').status_code, 403)
        self.assertEqual(self.login('faux').status_code, 429)
        response = self.login()
        self.assertEqual(response.status_code, 429)
        self.assertContains(response, 'Trop d', status_code=429)
        self.assertEqual(self.client.get('/gestion/visites').status_code, 302)
        self.assertEqual(AuditLog.objects.filter(action='login.failure').count(), 5)
        self.assertEqual(AuditLog.objects.filter(action='login.blocked', result='blocked').count(), 1)

    def test_block_is_per_ip(self):
        for _ in range(5):
            self.login('faux')
        self.assertEqual(self.login(ip='198.51.100.9').status_code, 302)

    def test_success_resets_the_counter(self):
        for _ in range(4):
            self.login('faux')
        self.login()
        self.client.post('/gestion/deconnexion')
        for _ in range(4):
            self.assertEqual(self.login('faux').status_code, 403)

    @override_settings(ADMIN_GLOBAL_MAX_FAILURES=3)
    def test_distributed_attack_triggers_global_block(self):
        for i in range(3):
            self.login('faux', ip=f'198.51.100.{i}')
        self.assertEqual(self.login(ip='192.0.2.50').status_code, 429)

    def test_unlock_all_lifts_the_global_block(self):
        from django.core.cache import cache
        cache.set(auth.GLOBAL_BLOCK_KEY, 1, 900)
        self.assertEqual(self.login().status_code, 429)
        auth.unlock_all()
        self.assertEqual(self.login().status_code, 302)


class SessionTests(AdminTestCase):
    def test_idle_session_expires(self):
        self.login()
        session = self.client.session
        session[auth.SESSION_SEEN] = int(time.time()) - 31 * 60
        session.save()
        response = self.client.get('/gestion/journal')
        self.assertEqual(response.status_code, 302)
        self.assertIn('expire=1', response['Location'])
        self.assertEqual(self.client.get('/gestion/journal').status_code, 302)
        self.assertTrue(AuditLog.objects.filter(action='session.expired').exists())
        self.assertContains(self.client.get('/gestion/connexion?expire=1'), 'Session expirée')

    def test_activity_keeps_the_session_alive(self):
        self.login()
        session = self.client.session
        session[auth.SESSION_SEEN] = int(time.time()) - 29 * 60
        session.save()
        self.assertEqual(self.client.get('/gestion/journal').status_code, 200)
        self.assertGreater(self.client.session[auth.SESSION_SEEN], int(time.time()) - 5)

    def test_logout(self):
        self.login()
        self.assertEqual(self.client.get('/gestion/deconnexion').status_code, 405)
        response = self.client.post('/gestion/deconnexion')
        self.assertRedirects(response, '/gestion/connexion', fetch_redirect_response=False)
        self.assertEqual(self.client.get('/gestion/visites').status_code, 302)
        self.assertTrue(AuditLog.objects.filter(action='logout').exists())

    def test_authenticated_pages_render_noindex(self):
        self.login()
        for url in ['/gestion/visites?jours=30', '/gestion/systeme?jours=7', '/gestion/journal']:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200, url)
            self.assertIn('noindex', response['X-Robots-Tag'])
            self.assertEqual(response['Cache-Control'], 'no-store')

    def test_api_cors_does_not_cover_admin(self):
        response = self.client.get('/gestion/connexion', HTTP_ORIGIN='https://evil.example')
        self.assertNotIn('Access-Control-Allow-Origin', response)
