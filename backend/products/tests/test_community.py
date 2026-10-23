import json
from unittest import mock

from django.core.cache import cache
from django.test import TestCase

from products.community import current_week
from products.models import Product, StatusReport, WeeklyChallenge


def make(code, name, **extra):
    defaults = dict(portal='food', brands='', labels_tags='', countries_tags='', data={})
    defaults.update(extra)
    return Product.objects.create(code=code, product_name=name, **defaults)


class CommunityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        make('1000000000001', 'Bonbons gélifiés', categories_tags='en:snacks,en:candies',
             ingredients_text='sucre, gélatine de porc', unique_scans_n=90)
        make('1000000000002', 'Bonbons halal A', categories_tags='en:snacks,en:candies',
             ingredients_text='sucre, amidon', unique_scans_n=50)
        make('1000000000003', 'Bonbons halal B', categories_tags='en:snacks,en:candies',
             ingredients_text='sucre, pectine', unique_scans_n=40)
        make('1000000000004', 'Chips', categories_tags='en:snacks,en:chips',
             ingredients_text='pommes de terre, sel', unique_scans_n=30)
        make('1000000000005', 'Sans ingrédients', unique_scans_n=80)
        make('1000000000006', 'Complété', ingredients_text='eau', unique_scans_n=70,
             data={'last_editor': 'fatima'})

    def setUp(self):
        cache.clear()

    def post(self, url, body):
        return self.client.post(url, json.dumps(body), content_type='application/json', HTTP_X_PORTAL='food')

    def test_classify_text_from_photo(self):
        data = self.post('/api/v2/classify', {'text': 'Sucre, sirop, arôme, rhum'}).json()
        self.assertEqual(data['status'], 'haram')
        self.assertIn('vin / spiritueux', data['ingredient_signals'])
        self.assertEqual(self.post('/api/v2/classify', {'text': 'سكر، ملح، زيت نباتي'}).json()['status'], 'halal')
        self.assertEqual(self.post('/api/v2/classify', {}).status_code, 400)

    def test_alternatives_same_category_halal_only(self):
        data = self.client.get('/api/v2/alternatives/1000000000001', HTTP_X_PORTAL='food').json()
        self.assertEqual(data['category'], 'en:snacks')     # moins de 3 dans en:candies → catégorie parente
        codes = [p['code'] for p in data['products']]
        self.assertEqual(codes[:2], ['1000000000002', '1000000000003'])
        self.assertNotIn('1000000000001', codes)
        self.assertEqual(self.client.get('/api/v2/alternatives/0000000000000').status_code, 404)

    def test_report_is_stored_and_rate_limited(self):
        ok = self.post('/api/v2/report', {'code': '1000000000001', 'reason': 'should-be-halal', 'message': 'Gélatine bovine'})
        self.assertEqual(ok.status_code, 201)
        report = StatusReport.objects.get()
        self.assertEqual((report.status_shown, report.message), ('haram', 'Gélatine bovine'))
        self.assertEqual(self.post('/api/v2/report', {'code': '1000000000001', 'reason': 'nope'}).status_code, 400)
        for _ in range(10):
            self.post('/api/v2/report', {'code': '1000000000001', 'reason': 'other'})
        self.assertEqual(self.post('/api/v2/report', {'code': '1000000000001', 'reason': 'other'}).status_code, 429)

    def test_weekly_challenge_progress_and_leaderboard(self):
        WeeklyChallenge.objects.create(portal='food', week=current_week(), codes=['1000000000005', '1000000000006'])
        data = self.client.get('/api/v2/challenge', HTTP_X_PORTAL='food').json()
        self.assertEqual((data['total'], data['done']), (2, 1))
        self.assertEqual(data['products'][0]['code'], '1000000000005')     # à compléter en premier
        self.assertEqual(data['leaderboard'], [{'name': 'fatima', 'count': 1}])

    def test_challenge_is_created_from_popular_unknown_products(self):
        data = self.client.get('/api/v2/challenge', HTTP_X_PORTAL='food').json()
        self.assertEqual([p['code'] for p in data['products']], ['1000000000005'])

    def test_share_page_has_preview_tags_and_redirects(self):
        page = self.client.get('/api/v2/share/1000000000001', HTTP_X_PORTAL='food').content.decode()
        self.assertIn('og:image" content="https://halalopenfoodfacts.org/proxy/v2/og/1000000000001.png"', page)
        self.assertIn('Bonbons gélifiés — Non conforme', page)
        self.assertIn('url=/product.html?code=1000000000001', page)

    def test_og_image_is_a_png(self):
        with mock.patch('products.community._fetch_image', return_value=None):
            response = self.client.get('/api/v2/og/1000000000002.png', HTTP_X_PORTAL='food')
        self.assertEqual(response['Content-Type'], 'image/png')
        self.assertTrue(response.content.startswith(b'\x89PNG'))
