from django.db import models
from django.contrib.postgres.search import SearchVectorField
from django.contrib.postgres.indexes import GinIndex


class Product(models.Model):
    PORTAL_FOOD = 'food'
    PORTAL_BEAUTY = 'beauty'
    PORTAL_CHOICES = [(PORTAL_FOOD, 'Food'), (PORTAL_BEAUTY, 'Beauty')]

    # --- Identification ---
    portal = models.CharField(max_length=10, choices=PORTAL_CHOICES, db_index=True)
    code = models.CharField(max_length=100, db_index=True)

    # --- Champs principaux (colonnes indexées) ---
    product_name = models.TextField(blank=True, default='')
    generic_name = models.TextField(blank=True, default='')
    brands = models.TextField(blank=True, default='')
    categories_tags = models.TextField(blank=True, default='')   # "en:biscuits,fr:gateaux"
    labels_tags = models.TextField(blank=True, default='')       # "en:halal,en:organic"
    countries_tags = models.TextField(blank=True, default='')    # "en:france,en:algeria"
    ingredients_text = models.TextField(blank=True, default='')
    image_front_small_url = models.TextField(blank=True, default='')
    image_front_url = models.TextField(blank=True, default='')
    image_ingredients_url = models.TextField(blank=True, default='')
    image_nutrition_url = models.TextField(blank=True, default='')

    # --- Stats ---
    unique_scans_n = models.IntegerField(default=0, db_index=True)
    last_modified_t = models.BigIntegerField(null=True, db_index=True)
    creator = models.CharField(max_length=200, blank=True, default='')
    contributors = models.TextField(blank=True, default='')  # comma-separated

    # --- Halal spécifique ---
    is_halal = models.BooleanField(null=True, db_index=True)     # True si label halal détecté
    is_excluded = models.BooleanField(null=True, db_index=True)  # True si label haram/alcool

    # --- Champs dynamiques (JSONB) ---
    # Nutriments, additifs, stores, packaging, etc.
    data = models.JSONField(default=dict)

    # --- Full-text search ---
    search_vector = SearchVectorField(null=True, blank=True)

    class Meta:
        unique_together = ('portal', 'code')
        indexes = [
            GinIndex(fields=['search_vector'], name='product_search_gin'),
            models.Index(fields=['portal', 'unique_scans_n'], name='portal_scans_idx'),
            models.Index(fields=['portal', 'last_modified_t'], name='portal_modified_idx'),
            models.Index(fields=['portal', 'is_halal'], name='portal_halal_idx'),
            models.Index(fields=['portal', 'is_excluded'], name='portal_excluded_idx'),
        ]

    def __str__(self):
        return f'[{self.portal}] {self.code} — {self.product_name}'

    def has_label(self, label: str) -> bool:
        return label in self.labels_tags.split(',')


class SyncLog(models.Model):
    """Historique des synchronisations delta OFF"""
    portal = models.CharField(max_length=10)
    sync_type = models.CharField(max_length=20)  # 'initial', 'delta'
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True)
    products_added = models.IntegerField(default=0)
    products_updated = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default='running')  # 'running', 'success', 'error'
    error_message = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f'{self.portal} {self.sync_type} {self.started_at:%Y-%m-%d %H:%M} → {self.status}'
