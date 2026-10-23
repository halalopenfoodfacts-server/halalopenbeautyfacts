"""
Synchronisation delta OFF — télécharge les fichiers delta JSONL toutes les heures.
Usage manuel : python manage.py sync_delta [--portal food|beauty]
En production : lancé automatiquement par Celery Beat toutes les heures.

Les deltas OFF sont disponibles à :
  Food   : https://static.openfoodfacts.org/data/delta/
  Beauty : https://static.openbeautyfacts.org/data/delta/

Format réel (vérifié oct. 2026) :
  - liste des fichiers dans <base>/index.txt (pas de page HTML)
  - noms : <site>_products_<start_unix>_<end_unix>.json.gz (≈ 1 fichier / jour)
  - contenu : JSONL gzip, 1 produit par ligne
  - OFF ne conserve que ~14 jours de fichiers
"""
import gzip
import io
import json
import re
import time
import urllib.request
from datetime import datetime, timezone, timedelta

from django.core.management.base import BaseCommand
from django.db.models import Max
from django.utils import timezone as tz

from products.images import front_image_urls
from products.halal import stamp_statuses
from products.models import Product, SyncLog
from products.management.commands.import_food import (
    row_to_product, detect_halal_excluded, BATCH_SIZE, Command as ImportFoodCommand
)

DELTA_URLS = {
    'food':   'https://static.openfoodfacts.org/data/delta/',
    'beauty': 'https://static.openbeautyfacts.org/data/delta/',
}
USER_AGENT = 'HalalOpenFoodFacts/1.0'
IMAGE_FIELDS = ('image_front_small_url', 'image_front_url')


DELTA_NAME_RE = re.compile(r'^[a-z]+_products_(\d+)_(\d+)\.json\.gz$')


def list_delta_files(base_url: str) -> list[tuple[str, int, int]]:
    """
    Liste les fichiers delta disponibles via <base>/index.txt.
    Retourne [(url, start_ts, end_ts), ...] trié par start_ts.
    Lève une exception en cas d'erreur réseau (pour qu'elle soit journalisée).
    """
    req = urllib.request.Request(base_url + 'index.txt', headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        names = r.read().decode().split()

    result = []
    for name in names:
        m = DELTA_NAME_RE.match(name.strip())
        if m:
            result.append((base_url + name.strip(), int(m.group(1)), int(m.group(2))))
    return sorted(result, key=lambda x: x[1])


def get_watermark(portal: str) -> int | None:
    """
    Timestamp (unix) jusqu'auquel les deltas ont déjà été appliqués :
    le plus récent entre
      - la fin du dernier fichier delta traité avec succès
      - le last_modified_t max des produits (ex : après un import complet)
    """
    last_delta = (SyncLog.objects
                  .filter(portal=portal, sync_type='delta', last_file_end_t__isnull=False)
                  .aggregate(m=Max('last_file_end_t'))['m'])
    last_product = Product.objects.filter(portal=portal).aggregate(m=Max('last_modified_t'))['m']
    candidates = [v for v in (last_delta, last_product) if v]
    return max(candidates) if candidates else None


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

    # Les deltas n'ont pas les URL d'images calculées par l'API : on les reconstruit.
    small, full = front_image_urls(code, data.get('images'), portal, str(data.get('lang') or ''))

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
        image_front_small_url=str(data.get('image_front_small_url') or small)[:500],
        image_front_url=str(data.get('image_front_url') or full)[:500],
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
        parser.add_argument('--hours', type=int, default=None,
                            help="Forcer le retraitement des fichiers des N dernières heures "
                                 "(par défaut : reprise automatique depuis le dernier fichier traité)")

    def handle(self, *args, **options):
        portals = ['food', 'beauty'] if options['portal'] == 'both' else [options['portal']]
        for portal in portals:
            self._sync_portal(portal, options['hours'])

    def _sync_portal(self, portal: str, hours: int | None):
        base_url = DELTA_URLS[portal]

        if hours is not None:
            since = int(time.time()) - hours * 3600
            self.stdout.write(f'[{portal}] Mode forcé : fichiers des {hours} dernières heures')
        else:
            since = get_watermark(portal) or 0
            self.stdout.write(f'[{portal}] Reprise depuis {datetime.fromtimestamp(since, timezone.utc):%Y-%m-%d %H:%M} UTC')

        try:
            available = list_delta_files(base_url)
        except Exception as e:
            SyncLog.objects.create(portal=portal, sync_type='delta', status='error',
                                   finished_at=tz.now(), error_message=f'index.txt: {e}')
            self.stderr.write(f'  ❌ Impossible de lire {base_url}index.txt : {e}')
            return

        if not available:
            self.stderr.write('  ❌ index.txt vide ou format inattendu.')
            return

        todo = [f for f in available if f[2] > since]
        if not todo:
            self.stdout.write('  ✓ Déjà à jour, aucun nouveau fichier.')
            return

        # Trou de données : les fichiers entre `since` et le plus ancien disponible ont expiré chez OFF
        gap_msg = ''
        oldest_start = available[0][1]
        if since and since < oldest_start - 3600:
            gap_days = (oldest_start - since) / 86400
            gap_msg = (f'TROU de {gap_days:.0f} jours ({datetime.fromtimestamp(since, timezone.utc):%Y-%m-%d} → '
                       f'{datetime.fromtimestamp(oldest_start, timezone.utc):%Y-%m-%d}) : '
                       f'deltas expirés chez OFF, un import complet est nécessaire pour combler.')
            self.stderr.write(f'  ⚠️ {gap_msg}')

        self.stdout.write(f'  {len(todo)} fichier(s) à traiter')
        log = SyncLog.objects.create(portal=portal, sync_type='delta')
        total_added = total_updated = 0
        errors = []

        for file_url, _start, end in todo:
            self.stdout.write(f'  ↓ {file_url.split("/")[-1]}')
            try:
                a, u = self._process_file(file_url, portal)
                total_added += a
                total_updated += u
                # Avance le watermark fichier par fichier (reprise possible en cas d'échec)
                log.last_file_end_t = end
                log.products_added = total_added
                log.products_updated = total_updated
                log.save(update_fields=['last_file_end_t', 'products_added', 'products_updated'])
            except Exception as e:
                errors.append(f'{file_url.split("/")[-1]}: {e}')
                self.stderr.write(f'  ⚠️ Erreur sur {file_url}: {e}')
                break  # on s'arrête pour ne pas sauter de fichier ; reprise au prochain run

        # _upsert remet search_vector à NULL : on recalcule pour que la recherche full-text
        # retrouve les produits ajoutés / modifiés
        if total_added or total_updated:
            ImportFoodCommand._update_search_vectors(self, portal)

        log.status = 'error' if errors else 'success'
        log.error_message = '\n'.join(filter(None, [gap_msg] + errors))
        log.finished_at = tz.now()
        log.save()

        style = self.style.ERROR if errors else self.style.SUCCESS
        self.stdout.write(style(
            f'[{portal}] {"❌" if errors else "✅"} Delta sync : +{total_added} / ~{total_updated} mis à jour'
        ))

    def _process_file(self, file_url: str, portal: str) -> tuple[int, int]:
        added = updated = 0
        req = urllib.request.Request(file_url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=300) as response:
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
                        added += a
                        updated += u
                        batch = []
                if batch:
                    a, u = self._upsert(batch, portal)
                    added += a
                    updated += u
        return added, updated

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
            'unique_scans_n', 'last_modified_t', 'is_halal', 'is_excluded', 'halal_status', 'data',
            'search_vector',
        ]

        to_update = []
        for db_obj in existing_qs:
            new = batch_by_code[db_obj.code]
            for f in update_fields:
                # Une photo connue n'est jamais remplacée par une valeur vide
                if f in IMAGE_FIELDS and not getattr(new, f, ''):
                    continue
                setattr(db_obj, f, getattr(new, f, None))
            db_obj.search_vector = None
            to_update.append(db_obj)
        # Le statut dépend des ingrédients : calculé sur l'objet final (photo conservée, etc.)
        stamp_statuses(to_create + to_update)

        if to_create:
            Product.objects.bulk_create(to_create, ignore_conflicts=True)
        if to_update:
            Product.objects.bulk_update(to_update, update_fields, batch_size=200)

        return len(to_create), len(to_update)
