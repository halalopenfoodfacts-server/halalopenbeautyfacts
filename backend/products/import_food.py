"""
Import OpenFoodFacts CSV en streaming (sans stocker le fichier sur disque).
Usage: python manage.py import_food [--limit N] [--portal food]

Télécharge en streaming depuis :
https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
"""
import csv
import gzip
import io
import time
import urllib.request

csv.field_size_limit(10 * 1024 * 1024)  # 10 MB — certains champs OFF sont très longs
from datetime import datetime, timezone

from django.core.management.base import BaseCommand
from django.contrib.postgres.search import SearchVector
from django.db import transaction
from django.utils import timezone as tz

from products.models import Product, SyncLog

FOOD_CSV_URL = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz'
HALAL_LABELS = {'en:halal', 'fr:halal', 'en:halal-certified'}
HARAM_LABELS  = {'en:haram', 'en:alcohol', 'en:contains-alcohol', 'en:non-halal'}
BATCH_SIZE    = 500


def detect_halal_excluded(labels_tags: str):
    tags = set(t.strip() for t in labels_tags.split(',') if t.strip())
    is_halal    = bool(tags & HALAL_LABELS)
    is_excluded = bool(tags & HARAM_LABELS)
    return is_halal, is_excluded


def row_to_product(row: dict, portal: str) -> Product | None:
    code = row.get('code', '').strip()
    if not code:
        return None

    labels_tags = row.get('labels_tags', '')
    is_halal, is_excluded = detect_halal_excluded(labels_tags)

    try:
        last_modified = int(row.get('last_modified_t') or 0) or None
    except (ValueError, TypeError):
        last_modified = None

    try:
        scans = int(row.get('unique_scans_n') or 0)
    except (ValueError, TypeError):
        scans = 0

    # Champs dynamiques dans JSONB
    data = {}
    dynamic_fields = [
        'nutriments', 'additives_tags', 'allergens_tags',
        'stores', 'packaging', 'quantity', 'serving_size',
        'nutriscore_grade', 'nova_group', 'ecoscore_grade',
        'origins', 'manufacturing_places',
        'energy_100g', 'fat_100g', 'saturated-fat_100g',
        'carbohydrates_100g', 'sugars_100g', 'proteins_100g', 'salt_100g',
    ]
    for f in dynamic_fields:
        v = row.get(f, '')
        if v:
            data[f] = v

    return Product(
        portal=portal,
        code=code,
        product_name=row.get('product_name', '')[:500],
        generic_name=row.get('generic_name', '')[:500],
        brands=row.get('brands', '')[:300],
        categories_tags=row.get('categories_tags', '')[:1000],
        labels_tags=labels_tags[:500],
        countries_tags=row.get('countries_tags', '')[:500],
        ingredients_text=row.get('ingredients_text', '')[:5000],
        image_front_small_url=row.get('image_small_url', '') or row.get('image_front_small_url', ''),
        image_front_url=row.get('image_url', '') or row.get('image_front_url', ''),
        image_ingredients_url=row.get('image_ingredients_url', '') or row.get('image_ingredients_small_url', ''),
        image_nutrition_url=row.get('image_nutrition_url', '') or row.get('image_nutrition_small_url', ''),
        unique_scans_n=scans,
        last_modified_t=last_modified,
        creator=row.get('creator', '')[:200],
        contributors=row.get('contributors', '')[:500],
        is_halal=is_halal if (is_halal or is_excluded) else None,
        is_excluded=is_excluded if (is_halal or is_excluded) else None,
        data=data,
    )


class Command(BaseCommand):
    help = 'Importe OpenFoodFacts CSV en streaming (sans stocker le fichier sur disque)'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=0, help='Limite le nombre de produits importés (0 = tous)')
        parser.add_argument('--portal', type=str, default='food', help='Portal: food ou beauty')
        parser.add_argument('--url', type=str, default='', help='URL du CSV (override)')

    def handle(self, *args, **options):
        portal = options['portal']
        limit = options['limit']
        url = options['url'] or FOOD_CSV_URL

        log = SyncLog.objects.create(portal=portal, sync_type='initial')
        self.stdout.write(f'[{portal}] Démarrage import streaming depuis {url}')
        self.stdout.write('⚠️  Le téléchargement peut prendre 30-60 min selon la connexion...')

        total_added = 0
        total_updated = 0
        batch = []
        errors = 0
        start = time.time()

        try:
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

                        try:
                            product = row_to_product(row, portal)
                            if product:
                                batch.append(product)
                        except Exception:
                            errors += 1
                            continue

                        if len(batch) >= BATCH_SIZE:
                            added, updated = self._flush(batch, portal)
                            total_added += added
                            total_updated += updated
                            batch = []
                            elapsed = time.time() - start
                            self.stdout.write(
                                f'  → {total_added + total_updated:,} produits '
                                f'({total_added} nouveaux, {total_updated} mis à jour) '
                                f'| {elapsed:.0f}s écoulées',
                                ending='\r'
                            )

            # Dernier batch
            if batch:
                added, updated = self._flush(batch, portal)
                total_added += added
                total_updated += updated

        except Exception as e:
            log.status = 'error'
            log.error_message = str(e)
            log.finished_at = tz.now()
            log.products_added = total_added
            log.products_updated = total_updated
            log.save()
            self.stderr.write(f'\n❌ Erreur : {e}')
            return

        # Mettre à jour les vecteurs de recherche par batch
        self.stdout.write(f'\n🔍 Mise à jour des vecteurs de recherche...')
        self._update_search_vectors(portal)

        elapsed = time.time() - start
        log.status = 'success'
        log.finished_at = tz.now()
        log.products_added = total_added
        log.products_updated = total_updated
        log.save()

        self.stdout.write(
            self.style.SUCCESS(
                f'\n✅ Import terminé en {elapsed/60:.1f} min : '
                f'{total_added:,} ajoutés, {total_updated:,} mis à jour, {errors} erreurs'
            )
        )

    def _flush(self, batch: list, portal: str):
        """Bulk upsert : insert ou update si le produit existe déjà"""
        codes = [p.code for p in batch]
        batch_by_code = {p.code: p for p in batch}

        existing_qs = Product.objects.filter(portal=portal, code__in=codes)
        existing_codes = set(existing_qs.values_list('code', flat=True))

        to_create = [p for p in batch if p.code not in existing_codes]

        update_fields = [
            'product_name', 'generic_name', 'brands', 'categories_tags', 'labels_tags',
            'countries_tags', 'ingredients_text', 'image_front_small_url', 'image_front_url',
            'image_ingredients_url', 'image_nutrition_url', 'unique_scans_n', 'last_modified_t',
            'creator', 'contributors', 'is_halal', 'is_excluded', 'data',
        ]

        # Pour les mises à jour, récupérer les objets DB (avec PK) et leur affecter les nouvelles valeurs
        to_update = []
        for db_obj in existing_qs:
            new = batch_by_code[db_obj.code]
            for f in update_fields:
                setattr(db_obj, f, getattr(new, f))
            to_update.append(db_obj)

        if to_create:
            Product.objects.bulk_create(to_create, ignore_conflicts=True)
        if to_update:
            Product.objects.bulk_update(to_update, update_fields, batch_size=200)

        return len(to_create), len(to_update)

    def _update_search_vectors(self, portal: str):
        """Met à jour les SearchVector pour la recherche full-text PostgreSQL"""
        # Traite par tranches de 10 000 pour éviter les timeouts
        total = Product.objects.filter(portal=portal, search_vector__isnull=True).count()
        done = 0
        while True:
            ids = list(
                Product.objects.filter(portal=portal, search_vector__isnull=True)
                .values_list('id', flat=True)[:5000]
            )
            if not ids:
                break
            Product.objects.filter(id__in=ids).update(
                search_vector=SearchVector('product_name', weight='A', config='french')
                + SearchVector('brands', weight='B', config='french')
                + SearchVector('categories_tags', weight='C', config='french')
                + SearchVector('ingredients_text', weight='D', config='french')
            )
            done += len(ids)
            self.stdout.write(f'  Vecteurs : {done:,}/{total:,}', ending='\r')
        self.stdout.write(f'\n  ✅ {done:,} vecteurs mis à jour')
