"""
Import COMPLET OpenFoodFacts / OpenBeautyFacts CSV en streaming.
Stocke TOUTES les colonnes du CSV dans le JSONB data pour ne rien perdre.

Usage:
  python manage.py import_full --portal food
  python manage.py import_full --portal beauty
  python manage.py import_full --portal beauty --mode update  (update seulement)
"""
import csv
import gzip
import io
import time
import urllib.request

csv.field_size_limit(10 * 1024 * 1024)

from django.core.management.base import BaseCommand
from django.contrib.postgres.search import SearchVector
from django.db import transaction
from django.utils import timezone as tz

from products.models import Product, SyncLog

URLS = {
    'food':   'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz',
    'beauty': 'https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz',
}

HALAL_LABELS   = {'en:halal', 'fr:halal', 'en:halal-certified', 'ar:halal'}
HARAM_LABELS   = {'en:haram', 'en:alcohol', 'en:contains-alcohol', 'en:non-halal', 'en:alcoholic'}
BATCH_SIZE     = 1000

# Colonnes stockées comme champs Django directs
DIRECT_FIELDS = {
    'product_name':            ('product_name',          500),
    'generic_name':            ('generic_name',          500),
    'brands':                  ('brands',                300),
    'categories_tags':         ('categories_tags',      1000),
    'labels_tags':             ('labels_tags',           500),
    'countries_tags':          ('countries_tags',        500),
    'ingredients_text':        ('ingredients_text',     8000),
    'image_small_url':         ('image_front_small_url', 500),
    'image_front_small_url':   ('image_front_small_url', 500),
    'image_url':               ('image_front_url',       500),
    'image_front_url':         ('image_front_url',       500),
    'image_ingredients_url':   ('image_ingredients_url', 500),
    'image_nutrition_url':     ('image_nutrition_url',   500),
    'creator':                 ('creator',               200),
    'contributors':            ('contributors',          500),
}

# Colonnes EXCLUES du JSONB (inutiles ou dupliquées)
SKIP_FOR_JSONB = {
    'code', 'url', 'created_datetime', 'last_modified_datetime',
    'last_updated_datetime', 'created_t', 'last_updated_t',
    'product_name', 'generic_name', 'brands', 'categories_tags',
    'labels_tags', 'labels', 'countries_tags', 'countries', 'ingredients_text',
    'image_small_url', 'image_front_small_url', 'image_url', 'image_front_url',
    'image_ingredients_url', 'image_nutrition_url',
    'creator', 'contributors', 'unique_scans_n', 'last_modified_t',
    'additives_original_tags', 'ingredients_original_tags',
}


def detect_halal(labels_tags: str):
    tags = set(t.strip() for t in labels_tags.split(',') if t.strip())
    is_halal    = bool(tags & HALAL_LABELS)
    is_excluded = bool(tags & HARAM_LABELS)
    return (True if is_halal else None), (True if is_excluded else None)


def row_to_product(row: dict, portal: str) -> Product | None:
    code = row.get('code', '').strip()
    if not code or not code.replace(' ', '').isdigit() and len(code) > 20:
        return None

    labels_tags  = row.get('labels_tags', '')
    is_halal, is_excluded = detect_halal(labels_tags)

    try:
        last_modified = int(row.get('last_modified_t') or 0) or None
    except (ValueError, TypeError):
        last_modified = None

    try:
        scans = int(row.get('unique_scans_n') or 0)
    except (ValueError, TypeError):
        scans = 0

    # Champs directs
    direct = {}
    for csv_col, (field, maxlen) in DIRECT_FIELDS.items():
        val = row.get(csv_col, '').strip()
        if val and field not in direct:
            direct[field] = val[:maxlen]

    # JSONB : stocker TOUTES les colonnes non vides et non exclues
    data = {}
    for col, val in row.items():
        if col in SKIP_FOR_JSONB:
            continue
        val = (val or '').strip()
        if val:
            data[col] = val

    return Product(
        portal=portal,
        code=code,
        product_name=direct.get('product_name', ''),
        generic_name=direct.get('generic_name', ''),
        brands=direct.get('brands', ''),
        categories_tags=direct.get('categories_tags', ''),
        labels_tags=labels_tags[:500],
        countries_tags=direct.get('countries_tags', ''),
        ingredients_text=direct.get('ingredients_text', ''),
        image_front_small_url=direct.get('image_front_small_url', ''),
        image_front_url=direct.get('image_front_url', ''),
        image_ingredients_url=direct.get('image_ingredients_url', ''),
        image_nutrition_url=direct.get('image_nutrition_url', ''),
        unique_scans_n=scans,
        last_modified_t=last_modified,
        creator=direct.get('creator', ''),
        contributors=direct.get('contributors', ''),
        is_halal=is_halal,
        is_excluded=is_excluded,
        data=data,
    )


class Command(BaseCommand):
    help = 'Import complet OFF/OBF — stocke toutes les colonnes CSV en JSONB'

    def add_arguments(self, parser):
        parser.add_argument('--portal', type=str, default='food', choices=['food', 'beauty'])
        parser.add_argument('--limit',  type=int, default=0)
        parser.add_argument('--url',    type=str, default='')
        parser.add_argument('--mode',   type=str, default='full', choices=['full', 'update'],
                            help='full=reimporte tout, update=upsert seulement les existants')
        parser.add_argument('--skip-vectors', action='store_true', help='Ne pas recalculer les vecteurs de recherche')

    def handle(self, *args, **options):
        portal  = options['portal']
        limit   = options['limit']
        url     = options['url'] or URLS[portal]
        mode    = options['mode']
        skip_v  = options['skip_vectors']

        log = SyncLog.objects.create(portal=portal, sync_type='initial')
        self.stdout.write(f'\n[{portal.upper()}] Import COMPLET depuis:\n  {url}')
        self.stdout.write(f'Mode: {mode} | Batch: {BATCH_SIZE}\n')
        self.stdout.write('⏳ Téléchargement en cours (fichier ~1-2 GB compressé)...\n')

        total_added = total_updated = errors = 0
        batch = []
        start = time.time()

        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'HalalFacts/1.0'})
            with urllib.request.urlopen(req, timeout=600) as response:
                with gzip.GzipFile(fileobj=response) as gz:
                    reader = csv.DictReader(
                        io.TextIOWrapper(gz, encoding='utf-8', errors='replace'),
                        delimiter='\t'
                    )
                    self.stdout.write(f'📋 Colonnes CSV détectées: {len(reader.fieldnames or [])}\n')

                    for i, row in enumerate(reader):
                        if limit and i >= limit:
                            break
                        try:
                            product = row_to_product(row, portal)
                            if product:
                                batch.append(product)
                        except Exception as e:
                            errors += 1
                            continue

                        if len(batch) >= BATCH_SIZE:
                            added, updated = self._flush(batch, portal, mode)
                            total_added   += added
                            total_updated += updated
                            batch = []
                            elapsed = time.time() - start
                            rate = (total_added + total_updated) / max(elapsed, 1)
                            self.stdout.write(
                                f'\r  ✓ {total_added+total_updated:,} produits'
                                f' ({total_added:,} new, {total_updated:,} upd)'
                                f' | {rate:.0f}/s | {elapsed/60:.1f}min',
                                ending=''
                            )

            if batch:
                added, updated = self._flush(batch, portal, mode)
                total_added   += added
                total_updated += updated

        except Exception as e:
            log.status = 'error'
            log.error_message = str(e)[:500]
            log.finished_at = tz.now()
            log.products_added   = total_added
            log.products_updated = total_updated
            log.save()
            self.stderr.write(f'\n❌ Erreur fatale: {e}')
            return

        if not skip_v:
            self.stdout.write(f'\n\n🔍 Calcul des vecteurs full-text...')
            self._update_search_vectors(portal)

        elapsed = time.time() - start
        log.status = 'success'
        log.finished_at = tz.now()
        log.products_added   = total_added
        log.products_updated = total_updated
        log.save()

        self.stdout.write(self.style.SUCCESS(
            f'\n\n✅ Import terminé en {elapsed/60:.1f} min\n'
            f'   Ajoutés:    {total_added:,}\n'
            f'   Mis à jour: {total_updated:,}\n'
            f'   Erreurs:    {errors}\n'
        ))

    def _flush(self, batch, portal, mode):
        codes = [p.code for p in batch]
        by_code = {p.code: p for p in batch}

        existing_qs    = Product.objects.filter(portal=portal, code__in=codes)
        existing_codes = set(existing_qs.values_list('code', flat=True))

        update_fields = [
            'product_name', 'generic_name', 'brands', 'categories_tags',
            'labels_tags', 'countries_tags', 'ingredients_text',
            'image_front_small_url', 'image_front_url',
            'image_ingredients_url', 'image_nutrition_url',
            'unique_scans_n', 'last_modified_t',
            'creator', 'contributors', 'is_halal', 'is_excluded', 'data',
        ]

        to_create = [] if mode == 'update' else [p for p in batch if p.code not in existing_codes]
        to_update = []
        for db_obj in existing_qs:
            new = by_code[db_obj.code]
            for f in update_fields:
                setattr(db_obj, f, getattr(new, f))
            to_update.append(db_obj)

        if to_create:
            Product.objects.bulk_create(to_create, ignore_conflicts=True, batch_size=500)
        if to_update:
            Product.objects.bulk_update(to_update, update_fields, batch_size=200)

        return len(to_create), len(to_update)

    def _update_search_vectors(self, portal):
        done = 0
        while True:
            ids = list(
                Product.objects.filter(portal=portal, search_vector__isnull=True)
                .values_list('id', flat=True)[:5000]
            )
            if not ids:
                break
            Product.objects.filter(id__in=ids).update(
                search_vector=(
                    SearchVector('product_name', weight='A', config='french')
                    + SearchVector('brands',       weight='B', config='french')
                    + SearchVector('categories_tags', weight='C', config='french')
                    + SearchVector('ingredients_text', weight='D', config='french')
                )
            )
            done += len(ids)
            self.stdout.write(f'\r  Vecteurs: {done:,}', ending='')
        self.stdout.write(f'\n  ✅ {done:,} vecteurs mis à jour')
