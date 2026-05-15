from django.contrib import admin
from .models import Product, SyncLog


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
