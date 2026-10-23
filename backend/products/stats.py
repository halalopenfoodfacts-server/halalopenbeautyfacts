"""
Statistiques et facets pré-calculées.

Pourquoi : la table products_product fait ~10 Go (4,5 M produits food).
Calculer les stats ou les facets à chaque visite imposait un parcours complet
de la table (30 s à 2 min) → compteurs de la page d'accueil en échec,
dashboard en timeout et workers gunicorn bloqués pour tout le site.

Désormais une tâche Celery calcule tout en arrière-plan (toutes les 6 h et
après chaque synchronisation) et les vues ne font que lire le cache Redis.
"""
from django.core.cache import cache
from django.db import connection
from django.utils import timezone

from .countries import real_countries

PORTALS = ('food', 'beauty')
FACET_TYPES = ('countries', 'contributors', 'labels', 'categories')

# Colonnes texte séparées par des virgules ("en:france,en:spain")
_TAG_COLUMNS = {
    'countries': 'countries_tags',
    'labels': 'labels_tags',
    'categories': 'categories_tags',
}
FACET_LIMIT = 500  # assez pour tous les pays (~420), top N pour labels/catégories

# Pas d'expiration : la valeur reste servie jusqu'au prochain recalcul.
CACHE_FOREVER = None


def stats_key(portal):
    return f'precomputed:stats:{portal}'


def facet_key(portal, facet_type):
    return f'precomputed:facet:{portal}:{facet_type}'


def tag_display_name(tag_id: str) -> str:
    """'en:united-kingdom' → 'United Kingdom' (format attendu par le frontend)."""
    name = tag_id.split(':', 1)[1] if ':' in tag_id else tag_id
    return name.replace('-', ' ').replace('_', ' ').strip().title()


def _fetchall(sql, params):
    with connection.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def _tag_counts(portal, column):
    # unnest côté PostgreSQL : un seul parcours, aucun transfert ligne à ligne vers Python
    return _fetchall(
        f"""
        SELECT tag, COUNT(*) AS n
        FROM (
            SELECT lower(btrim(t)) AS tag
            FROM products_product p,
                 unnest(string_to_array(p.{column}, ',')) AS t
            WHERE p.portal = %s AND p.{column} <> ''
        ) s
        WHERE tag <> ''
        GROUP BY tag
        ORDER BY n DESC
        """,
        [portal],
    )


def compute_facet(portal, facet_type):
    if facet_type == 'contributors':
        rows = _fetchall(
            """
            SELECT creator, COUNT(*) AS n
            FROM products_product
            WHERE portal = %s AND creator <> ''
            GROUP BY creator
            ORDER BY n DESC
            """,
            [portal],
        )
        total_distinct = len(rows)
        tags = [
            {'id': c, 'name': c, 'products': n, 'count': n}
            for c, n in rows[:FACET_LIMIT]
        ]
    elif facet_type == 'countries':
        # Seuls les États réels comptent (pas « World », les régions, les territoires ni les fautes)
        countries = real_countries(_tag_counts(portal, _TAG_COLUMNS[facet_type]))
        total_distinct = len(countries)
        tags = [
            {'id': tag, 'iso': iso, 'name': tag_display_name(tag), 'products': n, 'count': n}
            for iso, tag, n in countries
        ]
    else:
        rows = _tag_counts(portal, _TAG_COLUMNS[facet_type])
        total_distinct = len(rows)
        tags = [
            {'id': t, 'name': tag_display_name(t), 'products': n, 'count': n}
            for t, n in rows[:FACET_LIMIT]
        ]
    return {
        'tags': tags,
        'count': total_distinct,
        'computed_at': timezone.now().isoformat(),
    }


def compute_stats(portal, contributors_count=None, countries_count=None):
    (total, halal, excluded, doubtful, unknown), = _fetchall(
        """
        SELECT COUNT(*),
               COUNT(*) FILTER (WHERE halal_status = 'halal'),
               COUNT(*) FILTER (WHERE halal_status = 'haram'),
               COUNT(*) FILTER (WHERE halal_status = 'doubtful'),
               COUNT(*) FILTER (WHERE halal_status = 'unknown')
        FROM products_product
        WHERE portal = %s
        """,
        [portal],
    )
    # Nutri-Score : répartition A → E (les autres valeurs, vides ou « not-applicable », sont « sans note »)
    grades = dict(_fetchall(
        """
        SELECT lower(data ->> 'nutriscore_grade'), COUNT(*)
        FROM products_product
        WHERE portal = %s AND lower(data ->> 'nutriscore_grade') IN ('a', 'b', 'c', 'd', 'e')
        GROUP BY 1
        """,
        [portal],
    ))
    nutriscore = {grade: grades.get(grade, 0) for grade in 'abcde'}
    if countries_count is None:
        countries_count = compute_facet(portal, 'countries')['count']
    if contributors_count is None:
        contributors_count = compute_facet(portal, 'contributors')['count']
    return {
        'portal': portal,
        'total': total,
        'halal': halal,
        'excluded': excluded,
        'doubtful': doubtful,   # halal + excluded + doubtful + unknown = total
        'unknown': unknown,
        'nutriscore': nutriscore,
        'nutriscore_none': total - sum(nutriscore.values()),
        'countries': countries_count,
        'contributors': contributors_count,
        'computed_at': timezone.now().isoformat(),
    }


def refresh_portal(portal):
    """Recalcule facets + stats d'un portail et les stocke dans le cache."""
    facets = {}
    for facet_type in FACET_TYPES:
        facets[facet_type] = compute_facet(portal, facet_type)
        cache.set(facet_key(portal, facet_type), facets[facet_type], CACHE_FOREVER)
    data = compute_stats(
        portal,
        contributors_count=facets['contributors']['count'],
        countries_count=facets['countries']['count'],
    )
    cache.set(stats_key(portal), data, CACHE_FOREVER)
    return data
