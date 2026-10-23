from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0005_product_halal_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='StatusReport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('portal', models.CharField(choices=[('food', 'Food'), ('beauty', 'Beauty')], max_length=10)),
                ('code', models.CharField(db_index=True, max_length=100)),
                ('reason', models.CharField(choices=[('should-be-halal', 'Le produit est halal'), ('should-be-haram', "Le produit contient de l'alcool ou du porc"), ('wrong-ingredients', 'Les ingrédients sont faux ou incomplets'), ('other', 'Autre')], max_length=20)),
                ('message', models.TextField(blank=True, default='')),
                ('status_shown', models.CharField(blank=True, default='', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('handled', models.BooleanField(default=False)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='WeeklyChallenge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('portal', models.CharField(choices=[('food', 'Food'), ('beauty', 'Beauty')], max_length=10)),
                ('week', models.CharField(max_length=8)),
                ('codes', models.JSONField(default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'unique_together': {('portal', 'week')}},
        ),
    ]
