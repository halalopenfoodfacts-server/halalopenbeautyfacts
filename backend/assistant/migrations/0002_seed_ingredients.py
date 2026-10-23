"""Table de référence des ingrédients : contenu initial (assistant/ingredients_seed.py)."""
from django.db import migrations


def seed(apps, schema_editor):
    from assistant.ingredients_seed import INGREDIENTS
    Ingredient = apps.get_model('assistant', 'Ingredient')
    for name, aliases, status, explanation in INGREDIENTS:
        Ingredient.objects.update_or_create(
            name=name, defaults={'aliases': aliases, 'status': status, 'explanation': explanation})


def unseed(apps, schema_editor):
    from assistant.ingredients_seed import INGREDIENTS
    apps.get_model('assistant', 'Ingredient').objects.filter(name__in=[i[0] for i in INGREDIENTS]).delete()


class Migration(migrations.Migration):

    dependencies = [('assistant', '0001_initial')]

    operations = [migrations.RunPython(seed, unseed)]
