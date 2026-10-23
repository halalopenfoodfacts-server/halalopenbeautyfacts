"""Contenu initial de la table Ingredient (migration 0002). Modifiable ensuite dans l'admin Django.

Statuts : compatible, ambigu (origine ou avis variables : vérifier), interdit.
Les explications restent factuelles et courtes ; elles ne remplacent ni une certification ni un avis religieux.
Alias : sans accents, en minuscules, séparés par des virgules.
"""

INGREDIENTS = [
    ('porc', 'pork, cochon, pig, swine, porcin, porcine, viande de porc, خنزير', 'interdit',
     "Viande ou dérivé de porc : interdit pour un produit halal."),
    ('saindoux / lard', 'saindoux, lard, lardons, bacon, jambon, ham, graisse de porc', 'interdit',
     "Graisse ou charcuterie de porc. Exception : « jambon de dinde » ou « de volaille » ne contient pas de porc."),
    ('alcool', 'alcohol, ethanol, alcool ethylique, ethyl alcohol, e1510, كحول', 'interdit',
     "Alcool ajouté comme ingrédient : non conforme. Les traces d'alcool servant de support à un arôme font "
     "l'objet d'avis divergents."),
    ('vin, bière et spiritueux', 'vin, wine, biere, beer, rhum, rum, whisky, cognac, liqueur, kirsch, brandy, vodka, '
     'calvados, نبيذ, خمر', 'interdit',
     "Boissons alcoolisées utilisées comme ingrédient (même en cuisine) : non conforme."),
    ('vinaigre de vin', 'wine vinegar, vinaigre de vin rouge, vinaigre de vin blanc', 'compatible',
     "La fermentation transforme l'alcool en acide acétique : le vinaigre est considéré comme compatible par la "
     "majorité des avis."),
    ('gélatine', 'gelatine, gelatin, gelatina, e441, جيلاتين', 'ambigu',
     "Protéine animale. D'origine porcine, elle est interdite ; bovine issue d'un abattage halal ou de poisson, "
     "elle est compatible. L'origine est rarement indiquée : vérifier l'emballage ou demander au fabricant."),
    ('carmin (E120)', 'e120, carmin, carmine, cochenille, cochineal, acide carminique', 'ambigu',
     "Colorant rouge extrait d'un insecte (cochenille). Les avis divergent : certains le jugent compatible, d'autres non."),
    ('mono- et diglycérides (E471)', 'e471, mono et diglycerides, mono- et diglycerides d acides gras, '
     'mono and diglycerides', 'ambigu',
     "Émulsifiant d'origine végétale ou animale (parfois porcine). Sans précision « d'origine végétale », "
     "l'origine est incertaine."),
    ('esters d\'acides gras (E472)', 'e472, e472a, e472b, e472c, e472e', 'ambigu',
     "Émulsifiants dérivés des E471 : même incertitude sur l'origine (végétale ou animale)."),
    ('glycérine (E422)', 'e422, glycerine, glycerol, glycerin', 'ambigu',
     "Peut être végétale ou animale. Végétale (le cas le plus fréquent aujourd'hui), elle est compatible."),
    ('gomme laque (E904)', 'e904, shellac, gomme laque', 'ambigu',
     "Sécrétion d'insecte utilisée pour enrober fruits et confiseries. Avis divergents."),
    ('L-cystéine (E920)', 'e920, l-cysteine, cysteine', 'ambigu',
     "Agent de panification. Peut provenir de plumes, de poils (dont porc) ou de synthèse."),
    ('présure', 'presure, rennet, caillette, enzyme coagulante', 'ambigu',
     "Enzyme qui fait cailler le lait pour le fromage. Animale (estomac de veau, abattage non précisé) ou "
     "microbienne / végétale (compatible)."),
    ('lactosérum', 'lactoserum, petit-lait, whey, serum de lait', 'ambigu',
     "Sous-produit de la fabrication du fromage : son statut dépend de la présure utilisée."),
    ('arôme naturel', 'arome naturel, aromes naturels, natural flavour, natural flavor, arome', 'ambigu',
     "Généralement compatible, mais un arôme peut contenir de l'alcool comme support ou une origine animale "
     "non précisée."),
    ('inosinate / guanylate (E631, E627)', 'e631, e627, e635, inosinate, guanylate', 'ambigu',
     "Exhausteurs de goût d'origine végétale, microbienne ou animale (poisson, viande)."),
    ('suif', 'suif, tallow, sodium tallowate, graisse de boeuf', 'ambigu',
     "Graisse animale (bœuf, mouton) fréquente dans les savons. Compatible seulement si l'animal a été abattu "
     "selon le rite."),
    ('collagène', 'collagene, collagen, hydrolyzed collagen', 'ambigu',
     "Protéine animale (bœuf, porc, poisson) : l'origine décide du statut."),
    ('placenta', 'placenta, placental protein', 'ambigu',
     "Extrait d'origine animale utilisé en cosmétique ; origine rarement précisée."),
    ('lécithine (E322)', 'e322, lecithine, lecithin, lecithine de soja, lecithine de tournesol', 'compatible',
     "Émulsifiant presque toujours végétal (soja, tournesol)."),
    ('pectine (E440)', 'e440, pectine, pectin', 'compatible', "Gélifiant végétal extrait des fruits."),
    ('agar-agar (E406)', 'e406, agar, agar-agar', 'compatible', "Gélifiant extrait d'algues, alternative végétale à la gélatine."),
    ('acide citrique (E330)', 'e330, acide citrique, citric acid', 'compatible', "Acidifiant produit par fermentation, compatible."),
    ('acide ascorbique (E300)', 'e300, acide ascorbique, vitamine c, ascorbic acid', 'compatible', "Vitamine C, compatible."),
    ('alcools gras (cosmétiques)', 'alcool cetylique, cetyl alcohol, alcool stearylique, stearyl alcohol, '
     'alcool cetearylique, cetearyl alcohol', 'compatible',
     "Malgré leur nom, ce ne sont pas des alcools enivrants : des cires d'origine végétale le plus souvent."),
]
