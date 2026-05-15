"""
Met à jour uniquement les champs image_front_url / image_front_small_url
depuis le CSV OFF/OBF en streaming, sans re-importer tous les produits.

Usage:
    python manage.py update_images --portal food
    python manage.py update_images --portal beauty
"""
import csv
import gzip
import io
import time
import urllib.request

csv.field_size_limit(10 * 1024 * 1024)

from django.core.management.base import BaseCommand
from django.db import connection

FOOD_CSV_URL   = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz'
BEAUTY_CSV_URL = 'https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz'

BATCH_SIZE = 2000


class Command(BaseCommand):
    help = 'Met à jour uniquement les images depuis le CSV OFF/OBF (streaming)'

    def add_arguments(self, parser):
        parser.add_argument('--portal', type=str, default='food', choices=['food', 'beauty'])
        parser.add_argument('--url', type=str, default='', help='URL override')
        parser.add_argument('--limit', type=int, default=0)

    def handle(self, *args, **options):
        portal = options['portal']
        limit  = options['limit']
        url    = options['url'] or (BEAUTY_CSV_URL if portal == 'beauty' else FOOD_CSV_URL)

        self.stdout.write(f'[{portal}] Mise à jour images depuis {url}')
        self.stdout.write('⚠️  Téléchargement en streaming, patience...')

        total   = 0
        updated = 0
        batch   = []   # liste de (code, image_url, image_small_url, ingr, nutri)
        start   = time.time()

        req = urllib.request.Request(url, headers={'User-Agent': 'HalalOpenFoodFacts/1.0'})
        with urllib.request.urlopen(req, timeout=300) as response:
            with gzip.GzipFile(fileobj=response) as gz:
                reader = csv.DictReader(
                    io.TextIOWrapper(gz, encoding='utf-8', errors='replace'),
                    delimiter='\t'
                )
                for i, row in enumerate(reader):
                    if limit and i >= limit:
                        break

                    code = row.get('code', '').strip()
                    if not code:
                        continue

                    img_url   = row.get('image_url', '') or row.get('image_front_url', '')
                    img_small = row.get('image_small_url', '') or row.get('image_front_small_url', '')
                    img_ingr  = row.get('image_ingredients_url', '') or row.get('image_ingredients_small_url', '')
                    img_nutri = row.get('image_nutrition_url', '') or row.get('image_nutrition_small_url', '')

                    if img_url or img_small:
                        batch.append((code, img_url, img_small, img_ingr, img_nutri))

                    total += 1
                    if len(batch) >= BATCH_SIZE:
                        updated += self._flush(batch, portal)
                        batch = []
                        elapsed = time.time() - start
                        self.stdout.write(
                            f'  → {total:,} lignes lues, {updated:,} produits mis à jour | {elapsed:.0f}s',
                            ending='\r'
                        )

        if batch:
            updated += self._flush(batch, portal)

        elapsed = time.time() - start
        self.stdout.write(
            self.style.SUCCESS(
                f'\n✅ Terminé en {elapsed/60:.1f} min : {total:,} lignes lues, {updated:,} images mises à jour'
            )
        )

    def _flush(self, batch, portal):
        """Bulk UPDATE via SQL pour la performance maximale"""
        if not batch:
            return 0

        # Construire un VALUES temporaire et JOIN pour UPDATE en masse
        values_sql = ', '.join(
            "(%s, %s, %s, %s, %s)"
            for _ in batch
        )
        params = []
        for code, img_url, img_small, img_ingr, img_nutri in batch:
            params.extend([code, img_url or '', img_small or '', img_ingr or '', img_nutri or ''])

        sql = f"""
            UPDATE products_product AS p
            SET
                image_front_url       = v.image_front_url,
                image_front_small_url = v.image_front_small_url,
                image_ingredients_url = v.image_ingredients_url,
                image_nutrition_url   = v.image_nutrition_url
            FROM (VALUES {values_sql}) AS v(code, image_front_url, image_front_small_url, image_ingredients_url, image_nutrition_url)
            WHERE p.code = v.code AND p.portal = %s
              AND (v.image_front_url != '' OR v.image_front_small_url != '')
        """
        params.append(portal)

        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return cursor.rowcount
