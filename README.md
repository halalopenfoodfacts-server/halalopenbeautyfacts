# 💄 Halal Open Beauty Facts — Frontend

> **🗄️ Données 100 % propriétaires** — Ce portail exploite sa **propre base PostgreSQL** avec 64 000+ produits cosmétiques importés depuis les dumps Open Beauty Facts.  
> **Aucune dépendance à l'API publique d'Open Beauty Facts en production.**

�� **Production** : https://halalopenbeautyfacts.org  
📦 **Dépôt** : https://github.com/halalopenfoodfacts-server/halalopenbeautyfacts  
🔗 **Portail sister** : [Halal Open Food Facts](https://halalopenfoodfacts.org)

---

## 📁 Structure

```
beauty/html/
├── index.html       # Catalogue cosmétiques — recherche, filtres halal, stats temps réel
├── product.html     # Fiche produit complète — ingrédients, labels, code-barres SVG
├── excluded.html    # Produits non conformes — alcool, graisses animales…
├── add.html         # Formulaire contribution produit
├── signin.html      # Authentification contributeur
├── legal.html       # Mentions légales
├── terms.html       # Conditions générales d'utilisation
└── assets/
    ├── css/
    │   ├── style.css       # Design principal (variables CSS, responsive)
    │   └── product.css     # Styles fiche produit
    └── js/
        ├── app.js          # Catalogue : recherche, filtres, pagination, hydrateStats()
        ├── product.js      # Fiche produit : safeGet(), parse_tags(), JsBarcode
        ├── add.js          # Contribution : formulaire + upload image
        ├── nav.js          # Navigation responsive + menu mobile
        └── locale.js       # i18n fr / en / ar / es (changement à chaud)
```

---

## 🗄️ Base de données

| Statistique | Valeur |
|---|---|
| Produits cosmétiques | **64 237** |
| Produits halal certifiés | 40 |
| Produits non conformes | 4 |
| Pays couverts | 345 |
| Contributeurs | 3 425 |

Les données proviennent du **dump CSV complet d'Open Beauty Facts**, importé en streaming dans PostgreSQL.  
Elles sont synchronisées automatiquement via **Celery Beat** (delta horaire).

> **Note technique** : certains champs tags (`categories_tags`, `labels_tags`, `countries_tags`) peuvent être stockés en string CSV dans le JSONB. La fonction `parse_tags()` dans `serializers.py` normalise toujours ces champs en tableaux avant envoi au frontend.

---

## 🚀 API (proxy local)

Toutes les requêtes passent par `/proxy/*` → `http://127.0.0.1:8000/api/*` (Django + DRF).  
L'en-tête `X-Portal: beauty` est ajouté automatiquement par Nginx.

| Endpoint | Usage |
|---|---|
| `/proxy/v2/product/{code}.json` | Fiche produit (ingrédients, labels, packaging…) |
| `/proxy/v2/search?q=…&page=1` | Recherche full-text PostgreSQL |
| `/proxy/v2/search?is_halal=1` | Produits halal certifiés |
| `/proxy/v2/search?is_excluded=1` | Produits non conformes |
| `/proxy/stats` | `{total, halal, excluded, countries, contributors}` |
| `/proxy/top` | Top produits scannés |
| `/proxy/recent` | Récemment ajoutés |

---

## 🌍 Internationalisation

`locale.js` gère 4 langues : **Français · English · العربية · Español**

Changement de langue sans rechargement. Direction RTL automatique pour l'arabe.

---

## 🛠️ Déploiement

```bash
# Déployer en production
sudo rsync -av --delete /home/debian/halal-frontend/beauty/html/ /var/www/halalopenbeautyfacts/
sudo chown -R www-data:www-data /var/www/halalopenbeautyfacts/
```

---

## 📄 Licence

- Code : [MIT](../LICENSE)
- Données : [ODbL](https://opendatacommons.org/licenses/odbl/)
- Contenus : [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
