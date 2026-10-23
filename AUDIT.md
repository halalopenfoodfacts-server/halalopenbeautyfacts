# AUDIT — Halal Open Food Facts & Halal Open Beauty Facts

Audit du 22/10/2026, branche `refonte-v2`.

**Méthode**
- Lecture complète du code : frontends `food/html` et `beauty/html`, backend `halal-backend`, `docker-compose.yml`, nginx de production (`/etc/nginx/sites-enabled/*`), scripts de déploiement.
- Parcours de chaque page de production dans Chromium headless (Playwright) en 390×844. Relevé des erreurs console, des exceptions JS, des violations CSP et des requêtes en échec.
- Appels directs à l'API Django (`127.0.0.1:8000`) pour mesurer les temps de réponse et tester les cas limites.
- Rendu de la fiche produit sur 31 produits réels (top scans, halal, non conformes), avec comparaison du verdict affiché aux drapeaux `is_halal` / `is_excluded` de la base.

Gravité : 🔴 bloquant / faux résultat · 🟠 fonctionnalité cassée · 🟡 dégradé · ⚪ dette / hygiène.

---

## 1. Le bug connu : « erreur affichée alors que le rendu a réussi »

| # | Où | Constat | Cause |
|---|---|---|---|
| B1 🔴 | `excluded.html` (food **et** beauty) | L'API répond 200 et le compteur « 564 produits non conformes » s'affiche. La grille est ensuite remplacée par « ❌ Erreur de chargement ». | `reasonLabel()` appelle `(product.labels_tags \|\| '').toLowerCase()`. Le serializer renvoie maintenant `labels_tags` sous forme de **tableau** (`parse_tags`), donc `TypeError`. Le rendu est dans le même `try` que le `fetch` : le `catch` attrape l'exception de rendu et affiche une erreur réseau. |
| B1b 🟠 | `excluded.html` | Le bouton « Réessayer » de ce message d'erreur ne fait rien. | `onclick="loadPage(n)"` alors que `loadPage` est locale à une IIFE : `ReferenceError`. |
| B2 🟠 | Accueil (food + beauty) | `Uncaught (in promise) ReferenceError: Cannot access 'clearAuthRetry' before initialization` à chaque chargement. Le widget compte reste bloqué sur « Vérification en cours… ». | `hydrateAccountWidget()` est appelée (l. 1185) avant la déclaration `const clearAuthRetry = …` (l. 1347) : zone morte temporelle. |
| B3 🟠 | Accueil → connexion | Après « Se connecter », l'utilisateur est renvoyé sur l'accueil comme si la connexion avait réussi, mais rien n'a été envoyé. | `auth.js` lance une redirection à 600 ms quel que soit le résultat. Le formulaire vise `world.openfoodfacts.org/cgi/login.pl`, bloqué par la CSP (`form-action 'self'`, `frame-src` sans OFF). |
| B4 🟠 | Statistiques | Si les stats ne sont pas encore calculées, l'accueil affiche « Erreur » alors que le backend répond « en cours de calcul ». | `/api/stats` renvoie 503 + `Retry-After` (comportement voulu). Le front le traite comme une panne au lieu de réessayer. |
| B5 🟡 | Fiche produit (food) | Toute exception de rendu affiche « Erreur lors du chargement de la fiche produit. Vérifiez votre connexion ». | Même schéma que B1 : `displayProduct()` est dans le `try` du `fetch`. Rien ne plante sur les 31 fiches testées, mais une donnée inattendue suffirait. |
| B6 🟡 | Session (`/proxy/session`) | « Invalid API response » en console sur chaque page qui charge le compte. | La route n'existe pas dans le nginx de prod : `try_files` renvoie `index.html` avec un **200**, que le client essaie de parser comme du JSON. |

## 2. Exactitude halal (cœur du produit)

| # | Constat | Cause |
|---|---|---|
| H1 🔴 | Des produits **sans aucune certification ni label** affichent « ✅ Halal confirmé » (ex. `6111242100992`, `3274080005003`). | Le score part de 100 et ne descend que si un mot-clé est trouvé. L'absence d'information est donc présentée comme une conformité. |
| H2 🔴 | Une **bière** (`8712000018825`, `is_excluded=true`, label `en:contains-alcohol`) affiche « ⚠️ Vérification recommandée ». | `computeHalalVerdict()` ignore `is_excluded`, `is_halal` et les labels d'exclusion. Il ne lit que les ingrédients, ici en espagnol (« malta de cebada »). |
| H3 🟠 | Un produit **certifié** Halal Food Authority (`5053990179039`) affiche « ⚠️ Vérification recommandée ». | Recherche par sous-chaîne : `vin` correspond à `vinegar` / `vinaigre`, `spirit` à `spirits`… |
| H4 🟠 | Le scanner affiche aussi « Halal confirmé » par défaut. | Même logique, dupliquée dans `app.js` (`quickHalalCheck`). |
| H5 🟡 | Les règles halal existent en 4 copies divergentes : `app.js`, `product.js` food, `product.js` beauty, `compare.html`. Le backend (`assistant/halal.py`) en a une 5ᵉ, plus prudente. | Pas de module partagé. |

## 3. Fonctionnalités cassées

| # | Où | Constat | Cause |
|---|---|---|---|
| F1 🟠 | Bouton « Scanner » (en-tête + hero) | Ne fait rien. | `handleBarcodeTrigger()` est définie mais aucun écouteur n'est attaché à `#barcode-button`. |
| F2 🟠 | Scanner caméra | Même branché, il ne pourrait pas démarrer. | `Permissions-Policy: camera=()` dans le nginx de prod. `BarcodeDetector` est absent d'iOS et de Firefox, sans solution de repli. Le repli `window.prompt()` est bloqué dans certains contextes. |
| F3 🟠 | Menu mobile | S'ouvre et se referme dans le même clic. | Deux gestionnaires sur `#nav-toggle` (`nav.js` et `script.js`) qui basculent l'état chacun leur tour. |
| F4 🟠 | Code-barres SVG (fiche produit) | Jamais affiché. | JsBarcode est chargé depuis `cdn.jsdelivr.net`, bloqué par la CSP `script-src 'self'`. |
| F5 🟠 | Ajouter un produit (`add.html`) | Envoi impossible. Le formulaire demande en plus le **mot de passe Open Food Facts** de l'utilisateur. | `fetch` POST vers `world.openfoodfacts.org` bloqué par la CSP (`connect-src 'self'`). Faire transiter les identifiants d'un service tiers par notre page est aussi un anti-pattern de sécurité. |
| F6 🟠 | « Éditer depuis ce site » (fiche produit) + envoi de photo | Envoi impossible. | Même cause que F5 (POST vers OFF bloqué par la CSP). Dans beauty, `parseApiJsonResponse` est appelée dans la synchro de session sans être définie dans food. |
| F7 🟠 | Inscription (`signup.html`) | Formulaire POST vers OFF dans une iframe, bloqué par `form-action` et `frame-src`. | Architecture impossible avec la CSP actuelle. |
| F8 🟠 | `halal-users.html` | « Unable to load Halal team members ». | `fetch` vers `world.openfoodfacts.org/team/...` bloqué par la CSP. Cela contredit en plus le principe « aucune requête vers OFF en prod ». |
| F9 🟠 | Filtres avancés Nutri-Score / NOVA / huile de palme | Sans effet : les produits ne changent pas. | Le front envoie `nutrition_grades_tags`, `nova_groups_tags`, `ingredients_analysis_tags`, que le backend ignore. |
| F10 🟠 | Recherche texte + filtres | Les filtres (halal, vegan, catégorie, pays) sont ignorés dès qu'un texte est saisi. | La recherche texte envoie `filters=labels_tags:…` (syntaxe Search-a-licious), que le backend ignore. Il attend `labels_tags=`, `is_halal=`… |
| F11 🟠 | Recherche par code-barres (« Nom, marque, ingrédient ou code-barres ») | « Aucun produit trouvé » pour un EAN existant. | Le code n'est pas dans `search_vector`. Le front ne détecte pas les saisies numériques. |
| F12 🟠 | Recherche sur `excluded.html` | Sans effet. | Paramètre `search_terms` envoyé, le backend attend `q`. |
| F13 🟠 | `dashboard.html` | Plus de 30 s de chargement, compteurs souvent en échec (timeouts à 6 s). | 4 requêtes `COUNT` avec `labels_tags__icontains` (parcours séquentiel des 4,5 M lignes) au lieu de `/proxy/stats`, déjà précalculé. `sort_by=created_t` n'est pas supporté. |
| F14 🟡 | Comparateur | Nutri-Score, NOVA, ingrédients toujours vides. Verdict halal toujours « OK ». | `/api/search/search` renvoie le serializer « liste », sans ces champs. |
| F15 🟡 | Listes perso (fiche produit) | Le bouton Favori/Courses ne montre jamais l'état « déjà ajouté ». | `isInList(key, item)` compare `p.code === item` (un objet). |
| F16 🟡 | « Avis de la communauté » (fiche produit) | Présentés comme communautaires alors qu'ils sont stockés dans le `localStorage` du visiteur. Personne d'autre ne les voit. | Fonction trompeuse. |
| F17 🟡 | « Ouvertures de la fiche » | Graphique **inventé** (générateur pseudo-aléatoire initialisé par le code-barres). | Donnée fabriquée présentée comme réelle. |
| F18 🟡 | Témoignages, « +3 500 produits en 30 jours », « 125 000 contributeurs » | Chiffres et citations codés en dur, non sourcés. Le vrai chiffre de contributeurs est 44 027. | Contenu statique non vérifié. |
| F19 🟡 | Géolocalisation automatique | Requête vers `ipapi.co` bloquée par la CSP (erreur console sur chaque page beauty). Fuite d'IP vers un tiers. | Fonction F6 de l'ancien code. |
| F20 🟡 | Lien « Certifiés halal » des statistiques | Mène au catalogue **sans** filtre halal. | Lien `#catalogue` brut. |

## 4. Images, performance, PWA, SEO

| # | Constat | Cause |
|---|---|---|
| P1 🟠 | Plusieurs centaines d'erreurs `ERR_FAILED` / `ERR_BLOCKED_BY_ORB` sur l'accueil. Les cartes produit apparaissent sans image. | Si la base n'a pas d'image (20 % des produits beauty, une partie des food, dont Nutella), le serializer **fabrique** `…/front_en.full.jpg`, une URL qui n'existe pas (404). L'image de secours `static.openfoodfacts.org/…/product-default.png` répond aussi 404. |
| P2 🟡 | Image hero `c.PNG` : 1,3 Mo. `d.png` : 300 Ko. Logos partenaires en PNG de 25 à 150 Ko. | Pas d'optimisation (WebP/AVIF, dimensions). |
| P3 🟡 | Google Fonts bloquées par la CSP sur toutes les pages : polices de repli + erreurs console. | `@import` de fonts.googleapis.com dans `style.css`. |
| P4 🟡 | Badges App Store / F-Droid / Google Play bloqués (CSP ou ORB). | Images tierces. |
| P5 🟡 | Service worker en *cache-first* avec un nom de cache figé (`halal-off-v1`) : les visiteurs gardent d'anciens JS/CSS. Pas de page hors-ligne. | `service-worker.js`. |
| P6 🟡 | Manifest PWA : une seule icône (logo non carré) déclarée en 192 et 512, `theme_color` différente du site. | `manifest.json`. |
| P7 🟡 | Toute URL inconnue renvoie l'accueil avec un **200** (soft 404), pas de page 404/500. | `try_files … /index.html` sur un site multi-pages. |
| P8 🟡 | Pas de sitemap, pas de `robots.txt`, pas d'Open Graph ni de canonical. Fiche produit sans `<title>` dynamique. | — |
| P9 ⚪ | ~70 lignes `console.log` de debug en production (`=== APP.JS LOADED ===`, `[LOCALE] …`). | — |
| P10 ⚪ | `test-api.html` publié en prod (appels directs à OFF bloqués par la CSP). | Fichier de dev. |

## 5. Accessibilité

| # | Constat |
|---|---|
| A1 🟡 | Cartes produit = `<div onclick>` : non atteignables au clavier, pas de rôle. `alt` non échappé (injection d'attribut possible). |
| A2 🟡 | Pagination en anglais (« Previous / Next ») sans `aria-current`. |
| A3 🟡 | Overlay du scanner sans `role="dialog"` ni piège du focus. |
| A4 🟡 | Emoji utilisés comme seuls porteurs de sens (statuts ✅ ⚠️ 🚫) sans texte équivalent pour les lecteurs d'écran à certains endroits. |

## 6. Backend (Django)

| # | Constat | Cause |
|---|---|---|
| D1 🟠 | `/api/top?page_size=abc`, `/api/recent?page_size=abc`, `/api/v2/search?page_size=-5` renvoient une **500 en HTML**. | `int()` non protégé. Valeur négative envoyée telle quelle au découpage du queryset. |
| D2 🟡 | `/api/v2/search?page=5000` : **25 s** (OFFSET profond sur 4,5 M lignes). Un robot peut monopoliser les workers. | Aucune borne sur `page`. |
| D3 🟡 | Filtres `labels_tags` / `categories_tags` / `countries_tags` : ~6 s à froid. | `icontains` sur des colonnes texte, parcours séquentiel. Atténué par le cache Redis (30 min). |
| D4 🟡 | Recherche « nutella » : « Nutella croissant » arrive avant le pot de Nutella. | Tri par `rank` seul, sans la popularité. |
| D5 🟡 | Statut halal non exposé de façon explicite (`halal_status`). Chaque client le recalcule à sa façon. | — |
| D6 🔴 (latent) | `config/settings.py` / `config/urls.py` (non commités) déclarent l'app `assistant`, mais `assistant/views.py` **n'existe pas**. Le prochain `docker compose build django` ferait planter Django au démarrage, donc **tout le site**. | Travail en cours interrompu le 20/10. |
| D7 ⚪ | Les correctifs de synchronisation et de stats précalculées **tournent en production** (conteneur du 18/10) mais n'étaient commités ni dans le monorepo ni dans `food/backend` / `beauty/backend`. | — |

## 7. Sécurité & configuration

| # | Constat | Action |
|---|---|---|
| S1 🔴 | `SECRET_KEY` Django et mot de passe PostgreSQL en clair dans `docker-compose.yml`, **publiés sur GitHub** (historique des deux dépôts). | Déplacés dans `.env` (non versionné). **Rotation à faire** (voir README). |
| S2 🟠 | `deploy-backend.sh` contient un mot de passe SSH en clair. Le fichier est ignoré par Git et absent de l'historique, mais présent sur le disque. | Supprimer le mot de passe, utiliser des clés SSH. **Changer ce mot de passe.** |
| S3 🟡 | La config nginx de production n'est versionnée nulle part, avec deux sauvegardes `.bak` à côté. | Versionnée dans `deploy/nginx/` de chaque dépôt. |
| S4 ⚪ | Le monorepo `halal-frontend` n'a pas de remote Git. | Signalé (à décider). |

---

## Correctifs

Chaque point ci-dessus est corrigé ou traité dans la branche `refonte-v2`. Le détail, avec la méthode de test, se trouve dans `FONCTIONNALITES.md`.
