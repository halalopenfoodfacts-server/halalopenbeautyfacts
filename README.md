# Halal Open Beauty Facts

La base de données ouverte des cosmétiques halal — https://halalopenbeautyfacts.org

Frontend du portail Halal Open Beauty Facts : recherche instantanée, scanner de codes-barres, fiche produit avec statut halal expliqué, catalogue filtrable, comparateur, listes personnelles, PWA hors ligne. HTML/CSS/JavaScript sans framework, construit avec esbuild. Les données viennent de notre API Django (dossier `backend/`), alimentée par Open Beauty Facts.

Documents : [AUDIT.md](AUDIT.md) (problèmes de l'ancienne version et leurs causes) · [FONCTIONNALITES.md](FONCTIONNALITES.md) (fonctionnalités, statut, méthode de test).

## Démarrer

```bash
npm ci
npm run build          # dist/ : pages, CSS/JS minifiés et versionnés, manifest, service worker, sitemap
npm run serve          # http://127.0.0.1:4173 — API_TARGET=http://127.0.0.1:8000 par défaut
npm run dev            # build à chaque modification + serveur
```

Le serveur local reproduit le nginx de production : mêmes routes `/proxy/*` (vers Django, avec `X-Portal: beauty`) et mêmes en-têtes de sécurité, lus dans `deploy/nginx/`.

Pour la base et l'API : `cp .env.example .env`, renseigner les valeurs, puis `docker compose up -d` (PostgreSQL, Redis, Django, Celery, nginx de dev sur `dist/`).

## Organisation

| Dossier | Contenu |
|---|---|
| `core/` | Socle **identique** à l'autre portail (`npm run check:shared`) : design system, JS, gabarits, tests, outils |
| `site/` | Propre au portail : `site.config.json` (nom, URL, liens, catégories, ingrédients sensibles), `theme.css` (couleur d'accent), images, contenus (blog, guide, mode voyage) |
| `deploy/nginx/` | Configuration nginx de production (CSP, cache, proxy) |
| `backend/` | API Django (réplique du backend de référence du serveur) |

Une page = un gabarit `core/pages/*.html` (ou `site/pages/*.html` pour le remplacer), avec un en-tête JSON (titre, description, script) et un script `core/js/pages/*.js`.

## Tests

```bash
npm test               # tests unitaires (node --test)
npm run test:e2e       # Playwright, desktop + mobile ; échoue sur toute erreur JS/console/CSP
npm run verify         # les deux + build
```

Les tests E2E utilisent l'API indiquée par `API_TARGET` (des données réelles). Les pannes sont simulées par interception réseau.

## Déploiement

Sur le serveur : `bash core/tools/deploy.sh`. Le script enchaîne tests, build, sauvegarde de la version en ligne, publication dans la racine web, installation nginx (restaurée automatiquement si `nginx -t` échoue) et vérification HTTP. Pour revenir à la version précédente : `bash core/tools/deploy.sh --rollback`.

## Statut halal

Le statut vient de l'API (`halal_status` : `halal`, `haram`, `doubtful`, `unknown`). Ce sont des déclarations de contributeurs, **pas des certifications**. Un produit n'est jamais affiché « halal » sans label halal déclaré.

## Licences

Code : MIT · Données : ODbL · Photos et textes : CC BY-SA.
