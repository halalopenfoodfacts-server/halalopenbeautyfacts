# FONCTIONNALITÉS — vérification de la refonte v2

Statuts : **OK** (fonctionnait, conservé et testé) · **Corrigée** (cassée avant, réparée et testée) · **Nouvelle** · **À revoir** (action humaine nécessaire).
Les numéros (B1, H2…) renvoient à `AUDIT.md`.

**Méthode de test**
- **U** : tests unitaires frontend `npm test` (22 tests, `core/tests/unit`).
- **E** : tests de bout en bout Playwright `npm run test:e2e` (40 scénarios × desktop 1366 px et mobile Pixel 5 = 78 exécutions par site, sur food et sur beauty). Ils échouent sur toute erreur JS, erreur console ou violation de la CSP de production.
- **B** : tests backend `bash scripts/test-backend.sh` (30 tests Django sur un PostgreSQL éphémère).
- **V** : vérification visuelle par captures (desktop et mobile, clair et sombre) sur les données réelles.
- **P** : mesure sur l'API de production (données réelles, 4,5 M de produits).

| Fonctionnalité | Food | Beauty | Statut | Test |
|---|---|---|---|---|
| **Recherche** | | | | |
| Recherche plein texte, pertinence pondérée par la popularité (D4) | ✔ | ✔ | Corrigée | B, E, P |
| Recherche instantanée (suggestions au fil de la frappe, clavier, Échap) | ✔ | ✔ | Nouvelle | E, P (0,03 à 0,4 s) |
| Recherche par code-barres → fiche directe (F11) | ✔ | ✔ | Corrigée | B, E |
| Filtres conservés avec un texte (F10) | ✔ | ✔ | Corrigée | B |
| Accueil : photo de famille + carte « Soutenir » (Faire un don / Devenir adhérent) dès l'arrivée ; bouton « Faire un don » dans l'en-tête de chaque page | ✔ | ✔ | Nouvelle | V |
| **Catalogue** | | | | |
| Filtre statut halal / non conforme | ✔ | ✔ | Corrigée | B, E |
| Filtres labels, catégorie, pays (tags exacts, indexés : 19 s → 0,1 s) | ✔ | ✔ | Corrigée | B, P |
| Filtres Nutri-Score / NOVA / sans huile de palme (F9) | ✔ | — | Corrigée | B, P (1 à 3,5 s à froid) |
| Tri popularité / récents / nom | ✔ | ✔ | OK | B |
| Pagination en liens, bouton Retour, URL partageable | ✔ | ✔ | Corrigée | U, E |
| Pages profondes bornées (25 s → 0,6 s) (D2) | ✔ | ✔ | Corrigée | B, P |
| Panneau de filtres mobile (bas d'écran, focus piégé) | ✔ | ✔ | Nouvelle | E (mobile) |
| État vide avec réinitialisation | ✔ | ✔ | Nouvelle | E |
| Erreur API : message clair + « Réessayer » fonctionnel | ✔ | ✔ | Corrigée | E (panne simulée) |
| **Page « Non conformes »** — plus de fausse erreur (B1, B1b) | ✔ | ✔ | Corrigée | E (régression) |
| Recherche dans les non conformes (F12) | ✔ | ✔ | Corrigée | E |
| **Fiche produit** | | | | |
| Statut halal prudent : jamais « halal » sans label (H1-H5) | ✔ | ✔ | Corrigée | B (11 cas), E, V |
| Sceau de statut + raisons détaillées | ✔ | ✔ | Nouvelle | E, V |
| Ingrédients sensibles surlignés (mots entiers) | ✔ | ✔ | Nouvelle | U, V |
| Nutri-Score, NOVA, tableau nutritionnel | ✔ | — | OK | V |
| Code-barres SVG (généré localement) (F4) | ✔ | ✔ | Corrigée | U, E |
| Réseau et rendu séparés, données inattendues tolérées (B5) | ✔ | ✔ | Corrigée | E (données piégées, XSS) |
| Produit introuvable : message + lien d'ajout | ✔ | ✔ | Corrigée | E |
| Réseau coupé : message + nouvel essai | ✔ | ✔ | Nouvelle | E |
| Titre, description, canonical, JSON-LD dynamiques | ✔ | ✔ | Nouvelle | E |
| Favoris / courses / à éviter (état affiché) (F15) | ✔ | ✔ | Corrigée | U, E |
| Partage (Web Share / copie du lien) | ✔ | ✔ | Nouvelle | V |
| « Compléter la fiche » sur Open Food/Beauty Facts | ✔ | ✔ | Corrigée (F6) | V |
| **Scanner** | | | | |
| Boutons Scanner (en-tête, barre mobile, accueil) (F1) | ✔ | ✔ | Corrigée | E |
| Caméra : BarcodeDetector natif, ou ZXing pour iOS/Firefox (F2) | ✔ | ✔ | Corrigée | **À revoir** sur téléphone réel (pas de caméra en test automatisé) |
| Saisie manuelle, validation, clé GS1, verdict immédiat | ✔ | ✔ | Nouvelle | U, E |
| Caméra refusée / absente : message + saisie manuelle | ✔ | ✔ | Nouvelle | E |
| **Accueil** : statistiques réelles, gestion du « calcul en cours » (B4) | ✔ | ✔ | Corrigée | E (503 simulé) |
| Produits populaires et récents | ✔ | ✔ | OK | E |
| Mode voyage → catalogue filtré par pays | ✔ | ✔ | Corrigée | V |
| **Comparateur** (3 produits, meilleure valeur, ingrédients non renseignés distingués) (F14) | ✔ | ✔ | Corrigée | E, V |
| **Mes listes** + historique, export JSON, vidage confirmé ; anciennes données conservées | ✔ | ✔ | Corrigée | U, E |
| **Statistiques** (précalculées, plus de 30 s de chargement) (F13) | ✔ | ✔ | Corrigée | E |
| **Communauté** : contributeurs réels depuis notre base (F8) | ✔ | ✔ | Corrigée | E |
| **Apprendre** : vérificateur par mot entier + quiz | ✔ | ✔ | Corrigée | E |
| **Blog** (articles en HTML statique, indexables) | ✔ | ✔ | OK | E |
| **Contribuer** : vérification du code puis lien vers l'ajout officiel (F5) | ✔ | ✔ | Corrigée | V |
| **Compte** : connexion/inscription sur Open Food/Beauty Facts, sans mot de passe saisi ici (B3, F7) | ✔ | ✔ | Corrigée | E |
| Don (Yapla), API, mentions légales, CGU | ✔ | ✔ | OK | E |
| **Transverse** | | | | |
| Pages 404 (vraie 404), 50x, hors ligne (P7) | ✔ | ✔ | Nouvelle | E |
| PWA installable (manifest, icônes maskable, raccourci Scanner) (P6) | ✔ | ✔ | Corrigée | E |
| Hors ligne : pages et fiches déjà vues, page de repli (P5) | ✔ | ✔ | Corrigée | E |
| Thème clair / sombre mémorisé | ✔ | ✔ | Corrigée | E |
| Langues fr / en / ar (RTL) / es pour l'interface | ✔ | ✔ | OK | U, E |
| Menu mobile (le double gestionnaire est supprimé) (F3) | ✔ | ✔ | Corrigée | E |
| Accessibilité : lien d'évitement, focus visible, ARIA, alt, contrastes | ✔ | ✔ | Corrigée | E |
| Aucun défilement horizontal sur mobile | ✔ | ✔ | Nouvelle | E (toutes les pages) |
| SEO : meta, Open Graph, canonical, sitemap.xml, robots.txt (P8) | ✔ | ✔ | Nouvelle | E |
| CSP stricte (scripts autorisés par empreinte), polices auto-hébergées (P3) | ✔ | ✔ | Corrigée | E (CSP de prod appliquée) |
| Build de production (`npm run build`) sans erreur ni avertissement | ✔ | ✔ | Nouvelle | build + CI |
| **Backend** | | | | |
| Paramètres invalides → plus d'erreur 500 (D1) | ✔ | ✔ | Corrigée | B |
| statement_timeout 20 s côté web | ✔ | ✔ | Nouvelle | P |
| Secrets hors du dépôt (.env) (S1) | ✔ | ✔ | Corrigée | revue |
| **Données** | | | | |
| Images manquantes : la synchro delta effaçait la photo à chaque mise à jour (les deltas OFF n'ont pas `image_front_url`). URL reconstruite depuis `images.selected.front`, photo connue jamais écrasée, produits affichés sans image complétés en arrière-plan via l'API OFF (`fill_missing_images`) | ✔ | ✔ | Corrigée | B, P |
| Performances Lighthouse > 90 (mobile) | ✔ | ✔ | Nouvelle | Lighthouse en production, voir ci-dessous |

## Résultats (23/10/2026, après mise en ligne)

| Vérification | Résultat |
|---|---|
| Tests backend (`scripts/test-backend.sh`) | 30 / 30 ✔ |
| Tests unitaires frontend (food, beauty) | 22 / 22 ✔ chacun |
| E2E contre **https://halalopenfoodfacts.org** (desktop + mobile) | 78 / 78 ✔ (2 scénarios propres à un seul appareil ignorés sur l'autre) |
| E2E contre **https://halalopenbeautyfacts.org** | 78 / 78 ✔ |
| Build de production (`npm run build`, ×2) | sans erreur ni avertissement ✔ |
| Socle commun identique food / beauty (`npm run check:shared`) | 91 fichiers identiques ✔ |

Lighthouse 12, profil mobile, sur la production (HTTP/2, gzip) :

| Page | Performance | Accessibilité | Bonnes pratiques | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| Accueil food | 98 | 100 | 100 | 100 | 1,7 s | 0 |
| Catalogue food | 97 | 100 | 100 | 100 | 2,2 s | 0,013 |
| Fiche produit food | 96 | 100 | 100 | 100 | 2,4 s | 0,041 |
| Accueil beauty | 99 | 100 | 100 | 100 | 1,8 s | 0 |
| Catalogue beauty | 97 | 100 | 100 | 100 | 2,5 s | 0,013 |

Desktop (accueil food) : performance 100.
