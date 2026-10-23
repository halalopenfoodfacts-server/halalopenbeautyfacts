from django.contrib import admin
from .models import Product, StatusReport, SyncLog, WeeklyChallenge


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['code', 'portal', 'product_name', 'brands', 'is_halal', 'is_excluded', 'unique_scans_n']
    list_filter = ['portal', 'is_halal', 'is_excluded']
    search_fields = ['code', 'product_name', 'brands']
    readonly_fields = ['search_vector']


@admin.register(SyncLog)
class SyncLogAdmin(admin.ModelAdmin):
    list_display = ['portal', 'sync_type', 'started_at', 'products_added', 'products_updated', 'status']
    list_filter = ['portal', 'sync_type', 'status']
    readonly_fields = ['started_at']


@admin.register(StatusReport)
class StatusReportAdmin(admin.ModelAdmin):
    """Signalements « ce statut me semble faux » envoyés depuis les fiches produits."""
    list_display = ['created_at', 'portal', 'code', 'reason', 'status_shown', 'handled']
    list_filter = ['handled', 'portal', 'reason']
    search_fields = ['code', 'message']
    list_editable = ['handled']


@admin.register(WeeklyChallenge)
class WeeklyChallengeAdmin(admin.ModelAdmin):
    list_display = ['week', 'portal', 'created_at']
