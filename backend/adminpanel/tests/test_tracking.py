import datetime
import json
import os
import tempfile
from unittest import mock

from django.core.cache import cache
from django.test import RequestFactory, TestCase, override_settings
from django.utils import timezone

from adminpanel import metrics, tracking
from adminpanel.models import PageHit, SearchTerm, SystemSample
from adminpanel.tasks import purge_admin_data

from .helpers import AdminTestCase

UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1'
UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36'


class HitTests(TestCase):
    def setUp(self):
        cache.clear()

    def hit(self, body, ua=UA_MOBILE, **extra):
        return self.client.post('/api/v2/hit', json.dumps(body), content_type='application/json',
                                HTTP_USER_AGENT=ua, HTTP_X_PORTAL='beauty', HTTP_X_REAL_IP='192.0.2.10', **extra)

    def test_page_view_is_recorded_without_cookie(self):
        response = self.hit({'p': '/en/product.html?code=3017620422003&x=1', 'tz': 'Europe/Paris'})
        self.assertEqual(response.status_code, 204)
        self.assertNotIn('Set-Cookie', str(response.cookies))
        hit = PageHit.objects.get()
        self.assertEqual((hit.portal, hit.path, hit.product_code, hit.device, hit.country),
                         ('beauty', '/product.html', '3017620422003', 'mobile', 'FR'))
        self.assertEqual(len(hit.visitor), 16)

    def test_same_visitor_same_day_one_hash_new_day_new_salt(self):
        self.hit({'p': '/'})
        self.hit({'p': '/catalogue.html'})
        self.assertEqual(PageHit.objects.values('visitor').distinct().count(), 1)
        request = RequestFactory().get('/', HTTP_X_REAL_IP='192.0.2.10', HTTP_USER_AGENT=UA_MOBILE)
        today = timezone.localdate()
        self.assertNotEqual(tracking.visitor_hash(request, today),
                            tracking.visitor_hash(request, today - datetime.timedelta(days=1)))

    def test_bots_gpc_and_bad_input_are_ignored(self):
        self.assertEqual(self.hit({'p': '/'}, ua='Googlebot/2.1').status_code, 204)
        self.assertEqual(self.hit({'p': '/'}, HTTP_SEC_GPC='1').status_code, 204)
        self.assertEqual(self.hit({'p': 'javascript:alert(1)'}).status_code, 400)
        self.assertEqual(self.hit(['x']).status_code, 400)
        self.assertEqual(self.client.get('/api/v2/hit').status_code, 405)
        self.assertFalse(PageHit.objects.exists())

    def test_device_and_country(self):
        self.assertEqual(tracking.device_of(UA_DESKTOP), 'desktop')
        self.assertEqual(tracking.device_of('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet')
        self.assertEqual(tracking.device_of('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile'), 'mobile')
        self.assertEqual(tracking.country_of('Africa/Casablanca'), 'MA')
        self.assertEqual(tracking.country_of('Pas/UnFuseau'), '')

    def test_search_terms_counted_once_per_visitor(self):
        for _ in range(3):
            self.client.get('/api/v2/search', {'q': 'Nutella  '}, HTTP_USER_AGENT=UA_DESKTOP, HTTP_X_REAL_IP='192.0.2.1')
        self.client.get('/api/v2/search', {'q': 'nutella'}, HTTP_USER_AGENT=UA_DESKTOP, HTTP_X_REAL_IP='192.0.2.2')
        self.client.get('/api/v2/search', {'q': 'nut', 'prefix': '1'}, HTTP_USER_AGENT=UA_DESKTOP)
        self.assertEqual(list(SearchTerm.objects.values_list('term', 'count')), [('nutella', 2)])

    @override_settings(ANALYTICS_RETENTION_DAYS=90, METRICS_RETENTION_DAYS=30)
    def test_purge_respects_retention(self):
        today = timezone.localdate()
        for age in (0, 89, 90, 120):
            PageHit.objects.create(day=today - datetime.timedelta(days=age), portal='food', path='/', visitor='v', device='mobile')
            SearchTerm.objects.create(day=today - datetime.timedelta(days=age), portal='food', term=f't{age}', count=1)
        SystemSample.objects.create(created_at=timezone.now() - datetime.timedelta(days=31))
        SystemSample.objects.create()
        purge_admin_data()
        self.assertEqual(PageHit.objects.count(), 2)
        self.assertEqual(SearchTerm.objects.count(), 2)
        self.assertEqual(SystemSample.objects.count(), 1)


class MetricsTests(TestCase):
    LINES = [
        '1.2.3.4 - - [23/Oct/2026:20:05:33 +0000] "GET / HTTP/2.0" 200 512 "-" "UA 1.234" 0.010',
        '1.2.3.4 - - [23/Oct/2026:20:05:34 +0000] "GET /proxy/v2/search?q=a HTTP/2.0" 200 512 "-" "UA" 0.300',
        '1.2.3.4 - - [23/Oct/2026:20:05:35 +0000] "GET /wp-admin HTTP/1.1" 404 0 "-" "bot"',
        '1.2.3.4 - - [23/Oct/2026:20:05:36 +0000] "GET /proxy/v2/product/1 HTTP/2.0" 502 0 "-" "UA" 0.500',
        'ligne illisible',
    ]

    def setUp(self):
        cache.clear()

    def test_parse_lines(self):
        result = metrics.parse_lines(self.LINES)
        self.assertEqual((result['requests'], result['errors_4xx'], result['errors_5xx']), (4, 1, 1))
        self.assertEqual(result['avg_response_ms'], 270.0)
        self.assertEqual(result['api_avg_response_ms'], 400.0)

    def test_log_is_read_incrementally_and_survives_rotation(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'access.log')
            with open(path, 'w') as fh:
                fh.write(self.LINES[0] + '\n')
            self.assertEqual(metrics._new_lines(path), [])          # premier passage : on part de la fin
            with open(path, 'a') as fh:
                fh.write(self.LINES[1] + '\n' + 'ligne incomplète')
            self.assertEqual(metrics._new_lines(path), [self.LINES[1]])
            with open(path, 'a') as fh:
                fh.write(' fin\n')
            os.rename(path, path + '.1')                             # logrotate
            with open(path, 'w') as fh:
                fh.write(self.LINES[3] + '\n')
            self.assertEqual(metrics._new_lines(path), ['ligne incomplète fin', self.LINES[3]])

    def test_collect_records_a_sample(self):
        with override_settings(NGINX_ACCESS_LOGS=[]):
            metrics.collect()
            sample = metrics.collect()
        self.assertIsNotNone(sample.mem_percent)
        self.assertIsNotNone(sample.disk_percent)
        self.assertIsNotNone(sample.db_size_mb)
        self.assertEqual(SystemSample.objects.count(), 2)

    def test_levels(self):
        self.assertEqual(metrics.level('disk_percent', 78), 'ok')
        self.assertEqual(metrics.level('disk_percent', 85), 'warn')
        self.assertEqual(metrics.level('disk_percent', 95), 'crit')
        self.assertEqual(metrics.level('cpu_percent', None), 'none')


class PagesWithDataTests(AdminTestCase):
    def test_visits_and_system_pages_render_data(self):
        today = timezone.localdate()
        PageHit.objects.create(day=today, portal='food', path='/product.html', product_code='123', visitor='a', device='mobile', country='MA')
        PageHit.objects.create(day=today, portal='food', path='/', visitor='b', device='desktop', country='FR')
        SearchTerm.objects.create(day=today, portal='food', term='couscous', count=4)
        for minutes in (60, 30, 5):
            SystemSample.objects.create(created_at=timezone.now() - datetime.timedelta(minutes=minutes), cpu_percent=95,
                                        mem_percent=50, disk_percent=78, db_size_mb=13000, requests=100, errors_5xx=3,
                                        api_avg_response_ms=120)
        self.login()
        response = self.client.get('/gestion/visites')
        for text in ('Fiche produit', 'couscous', 'Maroc', 'Mobile', '2 pages vues'):
            self.assertContains(response, text)
        response = self.client.get('/gestion/systeme')
        self.assertContains(response, 'Critique')      # CPU 95 % et 3 % de 5xx
        self.assertContains(response, '<polyline')
        self.assertContains(response, '12.7 Go')
