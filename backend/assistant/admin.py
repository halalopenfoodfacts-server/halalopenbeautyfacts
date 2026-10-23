from django.contrib import admin

from .models import Exchange, Ingredient


@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    """Table de référence lue par l'assistant (outil explain_ingredient)."""
    list_display = ['name', 'status', 'aliases']
    list_filter = ['status']
    search_fields = ['name', 'aliases']


@admin.register(Exchange)
class ExchangeAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'portal', 'question', 'outcome', 'unanswered_reason', 'cost_usd']
    list_filter = ['outcome', 'portal']
    search_fields = ['question']

    def has_change_permission(self, request, obj=None):
        return False
