from django.urls import path
from . import community, views

urlpatterns = [
    # Compatible avec les appels frontend existants (remplace /proxy/v2/)
    path('v2/search',                       views.search,          name='search'),
    # Gère /api/v2/product/CODE et /api/v2/product/CODE.json
    path('v2/product/<str:code>',           views.product_detail,  name='product-detail'),
    path('v2/product/<str:code>.json',      views.product_detail,  name='product-detail-json'),

    # Compatible avec /proxy/search/search (retourne hits au lieu de products)
    path('search/search',                   views.search_text,     name='search-text'),

    # Endpoints supplémentaires
    path('stats',                           views.stats,           name='stats'),
    path('top',                             views.top_products,    name='top-products'),
    path('recent',                          views.recent_products, name='recent-products'),
    path('facets/<str:facet_type>',         views.facets,          name='facets'),
    path('sync/status',                     views.sync_status,     name='sync-status'),

    # Aide à l'achat et communauté (products/community.py)
    path('v2/classify',                     community.classify_text, name='classify'),
    path('v2/alternatives/<str:code>',      community.alternatives,  name='alternatives'),
    path('v2/report',                       community.report,        name='report'),
    path('v2/challenge',                    community.challenge,     name='challenge'),
    path('v2/share/<str:code>',             community.share_page,    name='share'),
    path('v2/og/<str:code>',                community.og_image,      name='og-image'),
]
