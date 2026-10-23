"""Statut halal stocké (labels + ingrédients), pour filtrer et compter sans tout recalculer.

Ajout de colonne avec valeur constante : instantané sur PostgreSQL ≥ 11, même sur 4,5 M de lignes.
Le remplissage et l'index se font ensuite par `manage.py refresh_halal_status` (par lots).
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0004_json_score_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='halal_status',
            field=models.CharField(default='unknown', max_length=10),
        ),
    ]
