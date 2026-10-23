from django.contrib.postgres.search import SearchVector
from django.core.cache import cache
from django.test import TestCase
from unittest import mock

from products import views
from products.models import Product
from products.stats import refresh_portal, stats_key


def make(code, name, portal='food', **extra):
    defaults = dict(brands='', labels_tags='', categories_tags='', countries_tags='', ingredients_text='', data={})
    defaults.update(extra)
    return Product.objects.create(portal=portal, code=code, product_name=name, **defaults)


class ApiTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        make('3017620422003', 'Nutella pâte à tartiner', brands='Ferrero', unique_scans_n=900,
             ingredients_text='sucre, huile de palme, noisettes', data={'nutriscore_grade': 'e', 'nova_group': '4'})
        make('4009308066394', 'Nutella croissant', brands='Nutella', unique_scans_n=0,
             data={'nutriscore_grade': 'd', 'nova_group': 4})
        make('5053990179039', 'Samoussas poulet', labels_tags='en:halal,en:halal-food-authority', is_halal=True,
             ingredients_text='Water, spirit vinegar, chicken', countries_tags='en:united-kingdom', unique_scans_n=50,
             data={'nutriscore_grade': 'c', 'ingredients_analysis_tags': 'en:palm-oil-free'})
        make('8712000018825', 'Bière blonde', labels_tags='en:contains-alcohol', is_excluded=True,
             ingredients_text='Agua, malta de cebada', unique_scans_n=10, image_front_url='https://images.openfoodfacts.org/x.400.jpg')
        make('0012345678905', 'Bonbons', ingredients_text='sucre, gélatine de porc', unique_scans_n=5)
        make('7000000000001', 'Saucisson sec', labels_tags='en:non-halal,EN:Organic', unique_scans_n=1)
        make('3600523614462', 'Crème hydratante', portal='beauty', ingredients_text='Aqua, Cetearyl Alcohol')
        Product.objects.update(search_vector=(
            SearchVector('product_name', weight='A', config='french')
            + SearchVector('brands', weight='B', config='french')
        ))

    def setUp(self):
        cache.clear()
        patcher = mock.patch('products.views.fill_missing_images.delay')
        self.queue_images = patcher.start()
        self.addCleanup(patcher.stop)

    def get(self, url, portal='food'):
        return self.client.get(url, HTTP_X_PORTAL=portal)


class SearchTests(ApiTestCase):
    def test_catalogue_lists_portal_products_with_halal_status(self):
        data = self.get('/api/v2/search?page_size=10').json()
        codes = [p['code'] for p in data['products']]
        self.assertEqual(codes[0], '3017620422003')            # tri par popularité
        self.assertNotIn('3600523614462', codes)                # produit beauty exclu
        statuses = {p['code']: p['halal_status'] for p in data['products']}
        self.assertEqual(statuses['5053990179039'], 'halal')
        self.assertEqual(statuses['8712000018825'], 'haram')
        self.assertEqual(statuses['0012345678905'], 'haram')     # gélatine de porc
        self.assertEqual(statuses['3017620422003'], 'halal')     # ni alcool ni porc
        self.assertEqual(statuses['4009308066394'], 'unknown')   # ingrédients absents

    def test_missing_image_is_empty_not_fabricated(self):
        product = self.get('/api/v2/search?q=nutella&page_size=1').json()['products'][0]
        self.assertEqual(product['image_front_url'], '')
        beer = self.get('/api/v2/product/8712000018825.json').json()['product']
        self.assertEqual(beer['image_front_small_url'], 'https://images.openfoodfacts.org/x.400.jpg')

    def test_text_search_ranks_popular_product_first(self):
        data = self.get('/api/v2/search?q=nutella').json()
        self.assertEqual(data['count'], 2)
        self.assertEqual(data['products'][0]['code'], '3017620422003')

    def test_prefix_search_for_instant_results(self):
        data = self.get('/api/v2/search?q=nute&prefix=1').json()
        self.assertEqual(data['count'], 2)
        self.assertEqual(self.get('/api/v2/search?q=nute').json()['count'], 0)

    def test_barcode_query_returns_the_product(self):
        data = self.get('/api/v2/search?q=3017620422003').json()
        self.assertEqual(data['barcode_match'], '3017620422003')
        self.assertEqual([p['code'] for p in data['products']], ['3017620422003'])
        # EAN sans zéro initial
        self.assertEqual(self.get('/api/v2/search?q=12345678905').json()['barcode_match'], '0012345678905')

    def test_text_search_keeps_filters(self):
        # Régression F10 : filtres ignorés dès qu'un texte était saisi
        self.assertEqual(self.get('/api/v2/search?q=nutella&is_halal=1').json()['count'], 1)   # pâte : ni alcool ni porc
        self.assertEqual(self.get('/api/search/search?q=samoussas&is_halal=1').json()['hits'][0]['code'],
                         '5053990179039')

    def test_filters(self):
        def codes(qs):
            return {p['code'] for p in self.get('/api/v2/search?' + qs).json()['products']}
        self.assertEqual(codes('is_halal=1'), {'5053990179039', '3017620422003'})
        self.assertEqual(codes('is_excluded=1'), {'8712000018825', '0012345678905', '7000000000001'})
        self.assertEqual(codes('halal_status=unknown'), {'4009308066394'})
        self.assertEqual(codes('nutriscore=e'), {'3017620422003'})
        self.assertEqual(codes('nutriscore=d&nutriscore=e'), {'3017620422003', '4009308066394'})
        self.assertEqual(codes('nova=4'), {'3017620422003', '4009308066394'})   # texte « 4 » et nombre 4
        self.assertEqual(codes('palm_oil_free=1'), {'5053990179039'})
        self.assertEqual(codes('countries_tags=en:united-kingdom'), {'5053990179039'})
        self.assertEqual(codes('labels_tags=en:halal&labels_tags=en:halal-food-authority'), {'5053990179039'})
        # Correspondance exacte de tag (avant : sous-chaîne, « en:halal » trouvait « en:non-halal »)
        self.assertEqual(codes('labels_tags=en:halal'), {'5053990179039'})
        self.assertEqual(codes('labels_tags=en:organic'), {'7000000000001'})   # insensible à la casse

    def test_invalid_numbers_do_not_crash(self):
        # Régression D1 : page_size=abc ou négatif → 500 HTML
        for url in ('/api/v2/search?page_size=abc', '/api/v2/search?page_size=-5', '/api/v2/search?page=abc',
                    '/api/top?page_size=abc', '/api/recent?page_size=-1', '/api/search/search?page=0'):
            response = self.get(url)
            self.assertEqual(response.status_code, 200, url)
            self.assertEqual(response['Content-Type'], 'application/json')

    def test_page_is_capped(self):
        data = self.get('/api/v2/search?page=99999').json()
        self.assertEqual(data['page'], views.MAX_PAGE)
        self.assertEqual(data['products'], [])

    def test_count_is_capped_when_filtering(self):
        with self.settings():
            original = views.COUNT_CAP
            views.COUNT_CAP = 2
            try:
                data = self.get('/api/v2/search?nutriscore=c&nutriscore=d&nutriscore=e').json()
            finally:
                views.COUNT_CAP = original
        self.assertEqual(data['count'], 2)
        self.assertFalse(data['is_count_exact'])

    def test_fields_parameter_keeps_card_fields(self):
        product = self.get('/api/v2/search?fields=product_name&page_size=1').json()['products'][0]
        self.assertEqual(set(product), {'code', 'product_name', 'image_front_small_url', 'image_front_url', 'halal_status'})


class ProductDetailTests(ApiTestCase):
    def test_detail_includes_halal_explanation(self):
        product = self.get('/api/v2/product/8712000018825.json').json()['product']
        self.assertEqual(product['halal_status'], 'haram')
        self.assertEqual(product['halal']['label'], 'Non conforme')
        self.assertFalse(product['halal']['verified_certification'])

    def test_not_found_and_invalid_code(self):
        response = self.get('/api/v2/product/0000000000.json')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['status'], 0)
        self.assertEqual(self.get('/api/v2/product/abc%3Cscript%3E.json').status_code, 400)

    def test_portal_isolation(self):
        self.assertEqual(self.get('/api/v2/product/3600523614462.json').status_code, 404)
        beauty = self.get('/api/v2/product/3600523614462', portal='beauty').json()['product']
        self.assertEqual(beauty['halal_status'], 'halal')     # cetearyl alcohol ≠ éthanol

    def test_detail_accepts_ean_without_leading_zero(self):
        self.assertEqual(self.get('/api/v2/product/12345678905.json').json()['product']['code'], '0012345678905')


class StatsAndFacetsTests(ApiTestCase):
    def test_stats_computing_then_ready(self):
        response = self.client.get('/api/stats?portal=food')
        # Celery synchrone en test : le calcul est fait pendant la requête mais la réponse annonce 503
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response['Retry-After'], '120')
        refresh_portal('food')
        data = self.client.get('/api/stats?portal=food').json()
        self.assertEqual(data['total'], 6)
        self.assertEqual(data['halal'], 2)
        self.assertEqual(data['excluded'], 3)
        self.assertEqual(cache.get(stats_key('food'))['total'], 6)

    def test_facets(self):
        self.assertEqual(self.client.get('/api/facets/unknown.json').status_code, 400)
        refresh_portal('food')
        tags = self.get('/api/facets/countries.json').json()['tags']
        self.assertEqual(tags[0]['id'], 'en:united-kingdom')

    def test_top_and_recent(self):
        self.assertEqual(self.get('/api/top?page_size=2').json()['products'][0]['code'], '3017620422003')
        self.assertEqual(len(self.get('/api/recent?page_size=3').json()['products']), 3)


class MissingImageTests(ApiTestCase):
    def test_products_shown_without_image_are_queued_once(self):
        self.get('/api/top?page_size=2')
        self.queue_images.assert_called_once_with('food', ['3017620422003', '5053990179039'])
        self.queue_images.reset_mock()
        cache.delete('top_food_2')
        self.get('/api/top?page_size=2')
        self.queue_images.assert_not_called()

    def test_product_with_image_is_not_queued(self):
        self.get('/api/v2/product/8712000018825.json')
        self.queue_images.assert_not_called()

    def test_task_stores_images_from_off(self):
        from products.tasks import fill_missing_images
        urls = ('https://images.openfoodfacts.org/a.200.jpg', 'https://images.openfoodfacts.org/a.400.jpg')
        with mock.patch('products.images.fetch_front_images', side_effect=[urls, OSError('503')]), \
                mock.patch('time.sleep'):
            fill_missing_images('food', ['3017620422003', '4009308066394'])
        nutella = Product.objects.get(code='3017620422003')
        self.assertEqual((nutella.image_front_small_url, nutella.image_front_url), urls)
        self.assertEqual(Product.objects.get(code='4009308066394').image_front_url, '')

    def test_rate_limit_pauses_and_releases_remaining_products(self):
        import urllib.error
        from products.tasks import IMAGE_PAUSE_KEY, fill_missing_images, image_queue_key
        codes = ['3017620422003', '4009308066394', '5053990179039']
        for code in codes:
            cache.set(image_queue_key('food', code), '1')
        too_many = urllib.error.HTTPError('u', 429, 'Too Many Requests', None, None)
        with mock.patch('products.images.fetch_front_images', side_effect=[('', ''), too_many]), \
                mock.patch('time.sleep'):
            fill_missing_images('food', codes)
        self.assertTrue(cache.get(IMAGE_PAUSE_KEY))
        self.assertTrue(cache.get(image_queue_key('food', codes[0])))      # sans photo chez OFF : attendre
        self.assertIsNone(cache.get(image_queue_key('food', codes[1])))    # 429 : redemandé plus tard
        self.assertIsNone(cache.get(image_queue_key('food', codes[2])))
        self.get('/api/recent?page_size=3')
        self.queue_images.assert_not_called()                              # pause : rien n'est envoyé


class RefreshHalalStatusTests(ApiTestCase):
    def test_command_recomputes_stored_status(self):
        from django.core.management import call_command
        Product.objects.update(halal_status='unknown')
        call_command('refresh_halal_status', '--restart', '--pause', '0', stdout=open('/dev/null', 'w'))
        stored = dict(Product.objects.values_list('code', 'halal_status'))
        self.assertEqual(stored['3017620422003'], 'halal')
        self.assertEqual(stored['0012345678905'], 'haram')
        self.assertEqual(stored['4009308066394'], 'unknown')
        self.assertEqual(stored['3600523614462'], 'halal')
