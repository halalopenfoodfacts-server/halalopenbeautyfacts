"""
Signaux Django — invalide le cache stats en temps réel
après chaque ajout/modification de produit.
"""
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache

from .models import Product


def _invalidate_stats_cache(portal):
    cache.delete(f'stats_{portal}')
    cache.delete(f'top_{portal}_12')
    cache.delete(f'top_{portal}_24')


@receiver(post_save, sender=Product)
def on_product_save(sender, instance, **kwargs):
    _invalidate_stats_cache(instance.portal)


@receiver(post_delete, sender=Product)
def on_product_delete(sender, instance, **kwargs):
    _invalidate_stats_cache(instance.portal)
