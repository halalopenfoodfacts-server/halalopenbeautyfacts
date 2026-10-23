import json

from django.test import SimpleTestCase, TestCase

from products.images import front_image_urls, product_path
from products.management.commands.sync_delta import Command, process_jsonl_line
from products.models import Product

SELECTED = {'selected': {'front': {'it': {'rev': '29'}, 'en': {'rev': 45}}, 'ingredients': {}}}


class FrontImageUrlTests(SimpleTestCase):
    def test_product_path_pads_short_barcodes(self):
        self.assertEqual(product_path('01771879'), '000/000/177/1879')
        self.assertEqual(product_path('6111246721261'), '611/124/672/1261')
        self.assertEqual(product_path('abc-123'), 'abc-123')

    def test_current_delta_format(self):
        # Vérifié contre l'API OFF : front_en.45.200.jpg / .400.jpg pour 01771879
        self.assertEqual(front_image_urls('01771879', SELECTED, 'food', 'it'), (
            'https://images.openfoodfacts.org/images/products/000/000/177/1879/front_en.45.200.jpg',
            'https://images.openfoodfacts.org/images/products/000/000/177/1879/front_en.45.400.jpg',
        ))

    def test_french_photo_preferred_and_legacy_format(self):
        small, _ = front_image_urls('3017620422003', {'front_de': {'rev': 2}, 'front_fr': {'rev': 7}})
        self.assertTrue(small.endswith('/301/762/042/2003/front_fr.7.200.jpg'))

    def test_beauty_domain_and_no_photo(self):
        small, _ = front_image_urls('3600523614462', {'selected': {'front': {'de': {'rev': 3}}}}, 'beauty')
        self.assertTrue(small.startswith('https://images.openbeautyfacts.org/images/products/360/052/361/4462/front_de.3'))
        self.assertEqual(front_image_urls('1', {'selected': {'ingredients': {}}}), ('', ''))
        self.assertEqual(front_image_urls('1', None), ('', ''))


class DeltaImageTests(TestCase):
    def test_delta_line_builds_image_urls(self):
        product = process_jsonl_line(json.dumps({'code': '01771879', 'lang': 'it', 'images': SELECTED}).encode(), 'food')
        self.assertTrue(product.image_front_small_url.endswith('/front_en.45.200.jpg'))

    def test_update_without_image_keeps_known_photo(self):
        Product.objects.create(portal='food', code='3017620422003', product_name='Nutella',
                               image_front_small_url='https://images.openfoodfacts.org/old.200.jpg',
                               image_front_url='https://images.openfoodfacts.org/old.400.jpg')
        line = json.dumps({'code': '3017620422003', 'product_name': 'Nutella 400 g', 'images': {}}).encode()
        Command()._upsert([process_jsonl_line(line, 'food')], 'food')
        product = Product.objects.get(code='3017620422003')
        self.assertEqual(product.product_name, 'Nutella 400 g')
        self.assertEqual(product.image_front_small_url, 'https://images.openfoodfacts.org/old.200.jpg')
