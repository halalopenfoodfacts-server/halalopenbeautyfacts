"""Index sur Nutri-Score et NOVA (filtres avancés du catalogue).

Sans index, « nutriscore=b & pays=espagne » lisait le JSONB de chaque candidat (> 30 s).
"""
from django.db import migrations

FIELDS = {'nutriscore': 'nutriscore_grade', 'nova': 'nova_group'}


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('products', '0003_tag_array_indexes'),
    ]

    operations = [
        migrations.RunSQL(
            f"CREATE INDEX CONCURRENTLY IF NOT EXISTS product_{name}_idx ON products_product ((data -> '{key}'));",
            f'DROP INDEX CONCURRENTLY IF EXISTS product_{name}_idx;',
        )
        for name, key in FIELDS.items()
    ]
