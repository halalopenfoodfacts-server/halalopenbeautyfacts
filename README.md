<div align="center">

# 💄 Halal Open Beauty Facts

### La base de données collaborative des cosmétiques halal

[![Production](https://img.shields.io/badge/production-halalopenbeautyfacts.org-pink?style=for-the-badge)](https://halalopenbeautyfacts.org)
[![GitHub](https://img.shields.io/badge/github-halalopenbeautyfacts-181717?style=for-the-badge&logo=github)](https://github.com/halalopenfoodfacts-server/halalopenbeautyfacts)
[![Licence MIT](https://img.shields.io/badge/licence-MIT-blue?style=for-the-badge)](LICENSE)
[![Données ODbL](https://img.shields.io/badge/données-ODbL-orange?style=for-the-badge)](https://opendatacommons.org/licenses/odbl/)

</div>

---

## ☪️ À propos

**Halal Open Beauty Facts** est un portail communautaire open-source permettant de consulter, rechercher et contribuer à une base de données de produits cosmétiques et d'hygiène certifiés halal.

> 🗄️ **Infrastructure 100 % propriétaire** — Toutes les données sont hébergées sur **notre propre serveur PostgreSQL** (VPS OVH, Roubaix). Les dumps CSV d'Open Beauty Facts sont importés localement et synchronisés automatiquement.
>
> 🚫 **Aucune requête n'est envoyée à l'API publique d'Open Beauty Facts** en production. Tout est servi depuis notre infrastructure.

🔗 **Site** : https://halalopenbeautyfacts.org  
🥗 **Portail alimentaire** : https://halalopenfoodfacts.org

---

## 📊 Chiffres clés

| Indicateur | Valeur |
|---|---|
| 💄 Produits cosmétiques | **64 237** |
| ☪️ Produits halal certifiés | **40** |
| 🚫 Produits non conformes | **4** |
| 🌍 Pays couverts | **345** |
| 👥 Contributeurs | **3 425** |

---

## 🏗️ Architecture du projet

```
halalopenbeautyfacts/
│
├── html/                          # 🌐 Frontend (servi par Nginx en production)
│   ├── index.html                 # Catalogue — recherche, filtres, stats temps réel
│   ├── product.html               # Fiche produit — ingrédients, labels, packaging, code-barres SVG
│   ├── excluded.html              # Produits non conformes (alcool, graisses animales…)
│   ├── add.html                   # Formulaire de contribution produit
│   ├── signin.html                # Authentification contributeur
│   ├── legal.html                 # Mentions légales
│   ├── terms.html                 # Conditions générales d'utilisation
│   └── assets/
│       ├── css/
│       │   ├── style.css          # Design principal — variables CSS, responsive mobile
│       │   └── product.css        # Styles spécifiques à la fiche produit
│       └── js/
│           ├── app.js             # Catalogue : recherche full-text, filtres halal, hydrateStats()
│           ├── product.js         # Fiche : safeGet(), parse_tags(), JsBarcode SVG
│           ├── add.js             # Contribution : formulaire + upload image
│           ├── nav.js             # Navigation responsive + menu mobile
│           └── locale.js          # i18n fr / en / ar / es — changement à chaud, RTL arabe
│
├── backend/                       # ⚙️ API Django (partagée avec le portail food)
│   ├── Dockerfile                 # Image Python 3.11 + Gunicorn
│   ├── requirements.txt           # Django 4.2, DRF, Celery, psycopg2, redis…
│   ├── manage.py
│   ├── config/
│   │   ├── settings.py            # Config via variables d'environnement (.env)
│   │   ├── urls.py                # Routage principal /api/*
│   │   ├── celery.py              # Config Celery
│   │   └── wsgi.py
│   └── products/
│       ├── models.py              # Modèle Product — portal, code, data JSONB (200+ champs)
│       ├── serializers.py         # ProductListSerializer + ProductDetailSerializer + parse_tags()
│       ├── views.py               # Vues API — search, product, stats, top, recent, facets
│       ├── urls.py                # Routes /api/v2/…
│       ├── tasks.py               # Tâches Celery (sync delta)
│       └── management/commands/
│           ├── import_full.py     # Import CSV complet OBF (streaming, ~4min)
│           ├── sync_delta.py      # Sync delta horaire
│           └── update_images.py   # Mise à jour URLs images
│
├── docker-compose.yml             # 🐳 Stack complète — Postgres, Redis, Django, Celery, Nginx
├── nginx.conf                     # Config Nginx dev (port 8080)
├── .env.example                   # Template variables d'environnement (secrets exclus du dépôt)
├── .gitignore
└── README.md
```

---

## ⚙️ Stack technique

| Composant | Technologie | Rôle |
|---|---|---|
| Frontend | HTML5 / CSS3 / JS Vanilla | Zéro framework — léger et rapide |
| Backend API | **Django 4.2** + DRF | API REST JSON — tous les endpoints `/api/*` |
| Base de données | **PostgreSQL 16** | 64K+ produits, données JSONB complètes |
| Cache / Broker | **Redis 7** | Cache API + file de tâches Celery |
| Tâches async | **Celery** + Celery Beat | Import delta automatique toutes les heures |
| i18n | `locale.js` maison | fr / en / ar / es — RTL arabe automatique |
| Reverse proxy prod | **Nginx système** + Let's Encrypt | HTTPS, `/proxy/*` → `127.0.0.1:8000` |
| Code-barres | **JsBarcode 3.11.6** | Génération SVG locale EAN-8 / EAN-13 / CODE128 |
| Hébergeur | **VPS OVH** — 51.83.97.15 | Debian, Roubaix |

> 🔧 **Note technique** : certains champs tags JSONB (`categories_tags`, `labels_tags`, `countries_tags`) peuvent être stockés comme strings CSV au lieu de tableaux. La fonction `parse_tags()` dans `backend/products/serializers.py` normalise automatiquement ces champs avant envoi au frontend — prévenant tout crash JavaScript.

---

## 🚀 API — Endpoints disponibles

Le proxy Nginx redirige `/proxy/*` → `http://127.0.0.1:8000/api/*` avec l'en-tête `X-Portal: beauty`.

| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/proxy/v2/product/{code}.json` | Fiche produit complète (ingrédients, labels, packaging…) |
| GET | `/proxy/v2/search?q={terme}&page={n}` | Recherche full-text PostgreSQL |
| GET | `/proxy/v2/search?is_halal=1` | Produits halal certifiés uniquement |
| GET | `/proxy/v2/search?is_excluded=1` | Produits non conformes (alcool, graisses…) |
| GET | `/proxy/stats` | `{ total, halal, excluded, countries, contributors }` |
| GET | `/proxy/top` | Top produits les plus scannés |
| GET | `/proxy/recent` | Produits récemment ajoutés |
| GET | `/proxy/facets/` | Facettes — catégories, marques, pays, labels |

---

## 💻 Démarrage rapide (développement local)

### Prérequis
- Docker + Docker Compose
- Git

### Installation

```bash
# 1. Cloner le dépôt
git clone https://github.com/halalopenfoodfacts-server/halalopenbeautyfacts.git
cd halalopenbeautyfacts

# 2. Configurer les secrets
cp .env.example .env
# Éditer .env avec vos valeurs (SECRET_KEY, POSTGRES_PASSWORD…)

# 3. Lancer la stack complète
docker compose up -d

# Frontend Beauty → http://localhost:8080
# API Django      → http://localhost:8000
```

### Import des données

```bash
# Import complet depuis Open Beauty Facts (~4 minutes en streaming)
docker exec halal_django python manage.py import_full --portal beauty

# Synchronisation delta manuelle
docker exec halal_django python manage.py sync_delta --portal beauty

# Mise à jour images uniquement
docker exec halal_django python manage.py update_images --portal beauty
```

---

## 🌐 Déploiement production (VPS OVH)

```bash
# Déployer le frontend
sudo rsync -av --delete ./html/ /var/www/halalopenbeautyfacts/
sudo chown -R www-data:www-data /var/www/halalopenbeautyfacts/

# Rebuild + restart backend Django après modification Python
docker-compose -f /home/debian/halal-frontend/docker-compose.yml build django
docker-compose -f /home/debian/halal-frontend/docker-compose.yml up -d django

# Vérifier les logs
docker logs halal_django --tail=50
```

---

## 🌍 Internationalisation

Le fichier `html/assets/js/locale.js` gère **4 langues** sans rechargement de page :

| Code | Langue | Direction |
|---|---|---|
| `fr` | Français | LTR |
| `en` | English | LTR |
| `ar` | العربية | **RTL** (automatique) |
| `es` | Español | LTR |

---

## 🤝 Contribuer

1. Forkez ce dépôt
2. Créez une branche : `git checkout -b feature/ma-fonctionnalite`
3. Committez vos changements : `git commit -m 'feat: description'`
4. Pushez : `git push origin feature/ma-fonctionnalite`
5. Ouvrez une Pull Request

---

## 📜 Mentions légales

| | |
|---|---|
| Structure | Association Loi 1901 |
| Adresse | 392 rue des Peupliers, 59800 Lille |
| Directeur / DPO | M. Mustapha Zentar |
| Contact | contact@halalopenbeautyfacts.org |
| Hébergeur | OVH SAS, 2 rue Kellermann, 59100 Roubaix |

---

## 📄 Licences

| Périmètre | Licence |
|---|---|
| Code source | [MIT](LICENSE) |
| Données produits | [ODbL — Open Database License](https://opendatacommons.org/licenses/odbl/) |
| Contenus (photos, textes contributeurs) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |

---

<div align="center">

Fait avec ☪️ par la communauté **Halal Open Facts**

[halalopenbeautyfacts.org](https://halalopenbeautyfacts.org) · [halalopenfoodfacts.org](https://halalopenfoodfacts.org)

</div>
