"""
Synchronisation delta OFF — télécharge les fichiers delta JSONL toutes les heures.
Usage manuel : python manage.py sync_delta [--portal food|beauty]
En production : lancé automatiquement par Celery Beat toutes les heures.

Les deltas OFF sont disponibles à :
  Food   : https://static.openfoodfacts.org/data/delta/
  Beauty : https://static.openbeautyfacts.org/data/delta/
"""
import gzip
import io
import json
import time
import urllib.request
from datetime import datetime, timezone, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone as tz

from products.models import Product, SyncLog
from products.management.commands.import_food import (
    row_to_product, detect_halal_excluded, BATCH_SIZE
)

DELTA_URLS = {
    'food':   'https://static.openfoodfacts.org/data/delta/',
    'beauty': 'https://static.openbeautyfacts.org/data/delta/',
}


def list_delta_files(base_url: str, since_hours: int = 25) -> list[str]:
    """Récupère la liste des fichiers delta des dernières N heures"""
    req = urllib.request.Request(base_url, headers={'User-Agent': 'HalalOpenFoodFacts/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            html = r.read().decode()
    except Exception:
        return []

    # Parse les liens .jsonl.gz dans la page index
    import re
    files = re.findall(r'href="([^"]+\.jsonl\.gz)"', html)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=since_hours)

    result = []
    for f in files:
        # Nom format: YYYYMMDD_HHMM_products.jsonl.gz
        try:
            date_str = f.split('_')[0] + f.split('_')[1]
            dt = datetime.strptime(date_str, '%Y%m%d%H%M').replace(tzinfo=timezone.utc)
            if dt >= cutoff:
                result.append(base_url + f)
        except Exception:
            pass
    return sorted(result)


def process_jsonl_line(line: bytes, portal: str) -> Product | None:
    """Parse une ligne JSONL OFF et retourne un objet Product"""
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return None

    code = str(data.get('code', '') or data.get('id', '')).strip()
    if not code:
        return None

    labels_tags = ''
    lt = data.get('labels_tags', [])
    if isinstance(lt, list):
        labels_tags = ','.join(lt)
    elif isinstance(lt, str):
        labels_tags = lt

    is_halal, is_excluded = detect_halal_excluded(labels_tags)

    last_modified = data.get('last_modified_t')
    try:
        last_modified = int(last_modified) if last_modified else None
    except (ValueError, TypeError):
        last_modified = None

    try:
        scans = int(data.get('unique_scans_n') or 0)
    except (ValueError, TypeError):
        scans = 0

    # Extraire les champs dynamiques
    dynamic = {}
    for field in ['nutriments', 'additives_tags', 'allergens_tags', 'nutriscore_grade',
                  'nova_group', 'ecoscore_grade', 'quantity', 'serving_size']:
        v = data.get(field)
        if v is not None:
            dynamic[field] = v

    def _first(val):
        if isinstance(val, list):
            return val[0] if val else ''
        return str(val or '')

    def _join(val):
        if isinstance(val, list):
            return ','.join(str(v) for v in val)
        return str(val or '')

    return Product(
        portal=portal,
        code=code,
        product_name=str(data.get('product_name') or '')[:500],
        generic_name=str(data.get('generic_name') or '')[:500],
        brands=_join(data.get('brands') or data.get('brands_tags', []))[:300],
        categories_tags=_join(data.get('categories_tags', []))[:1000],
        labels_tags=labels_tags[:500],
        countries_tags=_join(data.get('countries_tags', []))[:500],
        ingredients_text=str(data.get('ingredients_text') or '')[:5000],
        image_front_small_url=str(data.get('image_front_small_url') or '')[:500],
        image_front_url=str(data.get('image_front_url') or '')[:500],
        image_ingredients_url=str(data.get('image_ingredients_url') or '')[:500],
        image_nutrition_url=str(data.get('image_nutrition_url') or '')[:500],
        unique_scans_n=scans,
        last_modified_t=last_modified,
        creator=str(data.get('creator') or '')[:200],
        contributors=_join(data.get('editors_tags', []))[:500],
        is_halal=is_halal if (is_halal or is_excluded) else None,
        is_excluded=is_excluded if (is_halal or is_excluded) else None,
        data=dynamic,
    )


class Command(BaseCommand):
    help = 'Sync delta OFF (JSONL) — à lancer toutes les heures via Celery Beat'

    def add_arguments(self, parser):
        parser.add_argument('--portal', type=str, default='both', help='food, beauty ou both')
        parser.add_argument('--hours', type=int, default=25, help='Nombre d\'heures de delta à récupérer')

    def handle(self, *args, **options):
        portals = ['food', 'beauty'] if options['portal'] == 'both' else [options['portal']]
        hours = options['hours']

        for portal in portals:
            self._sync_portal(portal, hours)

    def _sync_portal(self, portal: str, hours: int):
        base_url = DELTA_URLS[portal]
        self.stdout.write(f'[{portal}] Recherche des fichiers delta des {hours} dernières heures...')

        delta_files = list_delta_files(base_url, hours)
        if not delta_files:
            self.stdout.write(f'  Aucun fichier delta trouvé.')
            return

        self.stdout.write(f'  {len(delta_files)} fichier(s) trouvé(s)')
        log = SyncLog.objects.create(portal=portal, sync_type='delta')
        total_added = total_updated = 0

        for file_url in delta_files:
            self.stdout.write(f'  ↓ {file_url.split("/")[-1]}')
            try:
                req = urllib.request.Request(file_url, headers={'User-Agent': 'HalalOpenFoodFacts/1.0'})
                with urllib.request.urlopen(req, timeout=120) as response:
                    with gzip.GzipFile(fileobj=response) as gz:
                        batch = []
                        for line in gz:
                            line = line.strip()
                            if not line:
                                continue
                            product = process_jsonl_line(line, portal)
                            if product:
                                batch.append(product)
                            if len(batch) >= BATCH_SIZE:
                                a, u = self._upsert(batch, portal)
                                total_added += a
                                total_updated += u
                                batch = []
                        if batch:
                            a, u = self._upsert(batch, portal)
                            total_added += a
                            total_updated += u
            except Exception as e:
                self.stderr.write(f'  ⚠️ Erreur sur {file_url}: {e}')
                continue

        log.status = 'success'
        log.finished_at = tz.now()
        log.products_added = total_added
        log.products_updated = total_updated
        log.save()

        self.stdout.write(
            self.style.SUCCESS(
                f'[{portal}] ✅ Delta sync : +{total_added} / ~{total_updated} mis à jour'
            )
        )

    def _upsert(self, batch: list, portal: str):
        from django.contrib.postgres.search import SearchVector
        codes = [p.code for p in batch]
        batch_by_code = {p.code: p for p in batch}

        existing_qs = Product.objects.filter(portal=portal, code__in=codes)
        existing_codes = set(existing_qs.values_list('code', flat=True))

        to_create = [p for p in batch if p.code not in existing_codes]

        update_fields = [
            'product_name', 'brands', 'categories_tags', 'labels_tags', 'countries_tags',
            'ingredients_text', 'image_front_small_url', 'image_front_url',
            'unique_scans_n', 'last_modified_t', 'is_halal', 'is_excluded', 'data',
            'search_vector',
        ]

        to_update = []
        for db_obj in existing_qs:
            new = batch_by_code[db_obj.code]
            for f in update_fields:
                setattr(db_obj, f, getattr(new, f, None))
            db_obj.search_vector = None
            to_update.append(db_obj)

        if to_create:
            Product.objects.bulk_create(to_create, ignore_conflicts=True)
        if to_update:
            Product.objects.bulk_update(to_update, update_fields, batch_size=200)

        return len(to_create), len(to_update)
