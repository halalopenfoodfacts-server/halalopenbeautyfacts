"""
Recalcule halal_status pour tous les produits (après un changement de règle dans halal.py).

Usage : python manage.py refresh_halal_status [--portal food|beauty] [--batch 2000] [--restart]

Conçu pour la production (4,5 M de lignes sur un VPS à la mémoire comptée) :
- lots par id croissant, seules les lignes dont le statut change sont réécrites ;
- reprise automatique au dernier id traité (clé Redis) si la commande est interrompue ;
- VACUUM régulier pour réutiliser l'espace des anciennes versions de lignes ;
- index (portal, halal_status, popularité) créé à la fin, en CONCURRENTLY.
"""
import time

from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.db.models.fields.json import KeyTextTransform

from products.halal import classify
from products.models import Product

PROGRESS_KEY = 'refresh_halal_status:last_id:{}'
VACUUM_EVERY = 250_000
INDEX_SQL = ('CREATE INDEX CONCURRENTLY IF NOT EXISTS product_portal_status_scans_idx '
             'ON products_product (portal, halal_status, unique_scans_n DESC)')


class Command(BaseCommand):
    help = 'Recalcule le statut halal stocké (par lots, reprise automatique)'

    def add_arguments(self, parser):
        parser.add_argument('--portal', choices=['food', 'beauty'], default=None)
        parser.add_argument('--batch', type=int, default=2000)
        parser.add_argument('--pause', type=float, default=0.05, help='secondes entre deux lots')
        parser.add_argument('--restart', action='store_true', help='repartir du début')

    def handle(self, *args, **options):
        portal = options['portal']
        key = PROGRESS_KEY.format(portal or 'all')
        last_id = 0 if options['restart'] else (cache.get(key) or 0)
        qs = Product.objects.all() if portal is None else Product.objects.filter(portal=portal)
        qs = qs.annotate(ing_fr=KeyTextTransform('ingredients_text_fr', 'data'),
                         ing_any=KeyTextTransform('ingredients_text', 'data'))
        fields = ('id', 'portal', 'labels_tags', 'is_halal', 'is_excluded', 'ingredients_text',
                  'ing_fr', 'ing_any', 'halal_status')

        seen = changed = since_vacuum = 0
        started = time.monotonic()
        self.stdout.write(f'Reprise après id {last_id}' if last_id else 'Début du recalcul')
        while True:
            rows = list(qs.filter(id__gt=last_id).order_by('id').values_list(*fields)[:options['batch']])
            if not rows:
                break
            updates = []
            for pk, row_portal, labels, is_halal, is_excluded, ing, ing_fr, ing_any, current in rows:
                status = classify(labels, is_halal, is_excluded, ing or ing_fr or ing_any or '', row_portal)['status']
                if status != current:
                    updates.append((pk, status))
            if updates:
                with transaction.atomic(), connection.cursor() as cursor:
                    values = ','.join(['(%s, %s)'] * len(updates))
                    cursor.execute(
                        f'UPDATE products_product p SET halal_status = v.s '
                        f'FROM (VALUES {values}) AS v(id, s) WHERE p.id = v.id',
                        [x for pair in updates for x in pair],
                    )
            last_id = rows[-1][0]
            cache.set(key, last_id, 30 * 24 * 3600)
            seen += len(rows)
            changed += len(updates)
            since_vacuum += len(updates)
            if since_vacuum >= VACUUM_EVERY:
                self._vacuum()
                since_vacuum = 0
            if seen % 100_000 < options['batch']:
                rate = seen / max(time.monotonic() - started, 1)
                self.stdout.write(f'  {seen:>9} lus, {changed} modifiés (id {last_id}, {rate:.0f}/s)')
            time.sleep(options['pause'])

        self._vacuum()
        if not connection.in_atomic_block:   # VACUUM / CONCURRENTLY interdits en transaction (tests)
            self.stdout.write('Création de l\'index (portal, halal_status, popularité)…')
            with connection.cursor() as cursor:
                cursor.execute("SET maintenance_work_mem = '128MB'")
                cursor.execute(INDEX_SQL)
        cache.delete(key)
        from products.tasks import refresh_stats
        refresh_stats.delay(portal)
        self.stdout.write(self.style.SUCCESS(f'Terminé : {seen} produits lus, {changed} statuts modifiés'))

    def _vacuum(self):
        if connection.in_atomic_block:
            return
        with connection.cursor() as cursor:
            cursor.execute('VACUUM products_product')
