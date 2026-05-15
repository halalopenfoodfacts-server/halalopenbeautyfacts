from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('products.urls')),
    # Compatibilité directe pour search-a-licious (/proxy/search/ → /api/search/)
    path('search/', include('products.urls')),
]
