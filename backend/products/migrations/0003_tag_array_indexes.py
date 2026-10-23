"""Index GIN sur les tags (filtres labels / catégories / pays), correspondance exacte de tag.

Avant : `icontains` → parcours séquentiel des 4,5 M de lignes (9 à 19 s pour un filtre rare),
et « en:halal » correspondait aussi à « en:non-halal ». Un index trigramme a été essayé puis
écarté : très lent pour les tags fréquents (en:vegan 16 s, en:snacks > 40 s).
CONCURRENTLY : aucune écriture bloquée ; IF NOT EXISTS : sans effet si les index existent déjà.
"""
from django.db import migrations

COLUMNS = ('labels_tags', 'categories_tags', 'countries_tags')


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('products', '0002_synclog_last_file_end_t'),
    ]

    operations = [
        migrations.RunSQL(
            f"CREATE INDEX CONCURRENTLY IF NOT EXISTS product_{col}_arr "
            f"ON products_product USING gin ((string_to_array(lower({col}), ',')));",
            f'DROP INDEX CONCURRENTLY IF EXISTS product_{col}_arr;',
        )
        for col in COLUMNS
    ]
