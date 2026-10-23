import datetime

from django.test import override_settings
from django.utils import timezone

from adminpanel.tasks import purge_admin_data
from adminpanel.tests.helpers import AdminTestCase
from assistant.models import Exchange
from products.models import Product


class AssistantAdminTests(AdminTestCase):
    def setUp(self):
        super().setUp()
        Product.objects.create(portal='food', code='3017620422003', product_name='Nutella', data={})
        Exchange.objects.create(portal='food', question='Nutella est-il halal ?', product_codes=['3017620422003'],
                                tools=[{'name': 'get_product', 'input': {'code': '3017620422003'}}], cost_usd=0.0015)
        Exchange.objects.create(portal='food', question='Et les biscuits mystère ?', outcome='unanswered',
                                unanswered_reason='ingredients_missing', context_code='3000000000003', cost_usd=0.001)

    def test_requires_admin_session(self):
        self.assertEqual(self.client.get('/gestion/assistant').status_code, 302)

    @override_settings(ASSISTANT_DAILY_BUDGET_USD=0.003)
    def test_page_shows_questions_cost_unanswered_and_products(self):
        self.login()
        response = self.client.get('/gestion/assistant?jours=30')
        self.assertEqual(response.status_code, 200)
        for text in ('Questions par jour', '0.003 $', 'Attention', 'Et les biscuits mystère', 'Ingrédients non renseignés',
                     'Nutella', 'Lecture de fiche', '50 %'):
            self.assertContains(response, text)

    def test_exchanges_are_purged_after_90_days(self):
        today = timezone.localdate()
        Exchange.objects.create(portal='food', question='vieille', day=today - datetime.timedelta(days=90))
        Exchange.objects.create(portal='food', question='récente', day=today - datetime.timedelta(days=89))
        purge_admin_data()
        self.assertFalse(Exchange.objects.filter(question='vieille').exists())
        self.assertTrue(Exchange.objects.filter(question='récente').exists())
