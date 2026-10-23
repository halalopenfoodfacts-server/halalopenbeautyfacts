"""
Import OpenBeautyFacts CSV en streaming.
Usage: python manage.py import_beauty [--limit N]
"""

from adminpanel.commands import AuditedCommand
from django.core.management import call_command


BEAUTY_CSV_URL = 'https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz'

HALAL_LABELS  = {'en:halal', 'fr:halal'}
EXCL_LABELS   = {'en:alcohol', 'en:contains-alcohol', 'en:non-halal', 'en:haram'}


class Command(AuditedCommand):
    audit_action = 'import.run'

    help = 'Importe OpenBeautyFacts CSV en streaming'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=0)

    def handle(self, *args, **options):
        # Réutilise import_food avec portal=beauty et l'URL beauty
        self.stdout.write('Démarrage import OpenBeautyFacts...')
        call_command(
            'import_food',
            portal='beauty',
            url=BEAUTY_CSV_URL,
            limit=options['limit'],
        )
