"""
Statut halal d'un produit — source unique de vérité pour l'API et les frontends.

Règle de l'association (oct. 2026) : un produit dont la liste d'ingrédients est
renseignée et ne contient ni alcool ni porc est halal. Les labels déclarés priment.
La base ne contient aucune certification vérifiée : labels et ingrédients sont
saisis par les contributeurs Open Food Facts / Open Beauty Facts.

Statuts renvoyés, par ordre de priorité :
    doubtful  labels contradictoires (halal et alcool / non halal)
    haram     label d'exclusion, produit marqué is_excluded, ou alcool / porc dans les ingrédients
    halal     label halal déclaré
    doubtful  ingrédient d'origine incertaine (gélatine, E120, E471, présure…)
    halal     ingrédients renseignés, sans alcool ni porc (viandes comprises)
    unknown   liste d'ingrédients absente
"""
import re
import unicodedata

HALAL = 'halal'
HARAM = 'haram'
DOUBTFUL = 'doubtful'
UNKNOWN = 'unknown'
STATUSES = (HALAL, HARAM, DOUBTFUL, UNKNOWN)

# Labels utilisés par l'import (import_full.py / sync_delta.py) pour is_halal / is_excluded
GENERIC_HALAL_LABELS = {'en:halal', 'fr:halal', 'ar:halal', 'en:halal-certified'}
EXCLUSION_LABELS = {'en:haram', 'en:non-halal', 'en:contains-alcohol', 'en:alcohol', 'en:alcoholic'}

STATUS_LABEL = {
    HALAL: 'Halal',
    HARAM: 'Non conforme',
    DOUBTFUL: 'Douteux',
    UNKNOWN: 'Non renseigné',
}

STATUS_SUMMARY = {
    HALAL: "Un label halal a été déclaré par des contributeurs. Contrôlez le logo et l'organisme "
           "sur l'emballage.",
    HARAM: "Un label signalant de l'alcool ou un produit non halal a été déclaré pour ce produit.",
    DOUBTFUL: "Des informations demandent une vérification avant consommation.",
    UNKNOWN: "La liste des ingrédients n'est pas renseignée : impossible de se prononcer.",
}
SUMMARY_HALAL_INGREDIENTS = ("La liste des ingrédients ne contient ni alcool ni porc. Vérifiez "
                             "toujours l'emballage : la composition peut changer.")
SUMMARY_HARAM_INGREDIENTS = "La liste des ingrédients contient de l'alcool ou du porc."

# ── Ingrédients sensibles ──────────────────────────────────────────────────
# Recherche par mots entiers sur un texte sans accents, en minuscules.
# (Avant : sous-chaînes → « vin » trouvé dans « vinaigre », « spirit » dans « spirits ».)
_COMMON_SIGNALS = [
    ('porc', r'porc|porcine?|pork|pig|swine|schwein\w*|cerdo|maiale'),
    ('saindoux / lard', r'saindoux|lard|lards|lardons?|bacon|jambons?|ham'),
    ('gélatine', r'gelatine?s?|gelatina'),
    ('alcool', r'alcool|alcohol|ethanol|ethyl alcohol'),
    ('carmin (E120)', r'e\s*120|carmin|carmine|cochenilles?|cochineal'),
    ('E441', r'e\s*441'),
    ('mono- et diglycérides (E471)', r'e\s*471|mono\s*(et|and)\s*diglycerides?'),
    ('L-cystéine (E920)', r'e\s*920|l\s*cysteine'),
    ('présure / caillette', r'presure|rennet'),
]

# Emballages en arabe (Maroc, Algérie, Golfe…) : préfixes collés au mot (و، ب، ل، ف، ال)
_AR = r'(?:[وبلف])?(?:ال)?'
_ARABIC_SIGNALS = [
    ('porc', _AR + r'خنزير\w*'),
    ('alcool', _AR + r'(?:كحول\w*|ايثانول|إيثانول)'),
    ('vin / spiritueux', _AR + r'(?:نبيذ|خمر|خمور|بيرة|جعة)'),
    ('gélatine', _AR + r'(?:جيلاتين\w*|جلاتين\w*)'),
]

_FOOD_SIGNALS = [
    ('vin / spiritueux', r'vins?|wine|bieres?|beer|rhum|rum|whisky|cognac|liqueurs?|kirsch|brandy|vodka|calvados'),
    ('shellac (E904)', r'e\s*904|shellac|gomme laque'),
    ('glycérine (E422)', r'e\s*422|glycerine?|glycerol'),
]

_BEAUTY_SIGNALS = [
    ('suif', r'suif|tallow\w*'),
    ('collagène / placenta', r'collagene?|placenta'),
    ('kératine', r'keratine?'),
    ('carmin (CI 75470)', r'ci\s*75470'),
]

# En cosmétique, les « alcools gras » (cetyl, cetearyl…) ne sont pas de l'éthanol.
_FATTY_ALCOHOL = re.compile(
    r'\b(cetyl|cetearyl|stearyl|behenyl|benzyl|lanolin|myristyl|isostearyl|lauryl|oleyl|arachidyl|phenethyl)\s+alcohol\b'
)
# Le vinaigre de vin n'est plus du vin (avis majoritaire) : ne pas le signaler.
_WINE_VINEGAR = re.compile(r'\b(vinaigre\s+de\s+vins?|wine\s+vinegar|vinagre\s+de\s+vino)\b')
# « jambon de dinde », « bacon de volaille », « turkey ham » : pas de porc.
_POULTRY_HAM = re.compile(
    r'\b(jambons?|bacon|lardons?)\s+(de\s+)?(dinde|poulet|volaille|boeuf|veau)\b'
    r'|\b(turkey|chicken|beef)\s+(ham|bacon)\b'
)
# « sans porc », « sans alcool », « alcohol free »…
_NEGATION = re.compile(r'\b(sans|without|no|free from|sin|ohne)\s+(\w+\s+)?$')
_FREE_AFTER = re.compile(r'\s*(free|frei)\b')


def _compile(signals):
    return [(label, re.compile(r'\b(' + pattern + r')\b')) for label, pattern in signals]


# Ingrédients interdits : leur présence rend le produit non conforme.
# Les autres signaux (gélatine, E120, E471, présure…) le rendent seulement douteux.
HARAM_SIGNALS = {'porc', 'saindoux / lard', 'alcool', 'vin / spiritueux'}

_SIGNALS = {
    'food': _compile(_COMMON_SIGNALS + _FOOD_SIGNALS + _ARABIC_SIGNALS),
    'beauty': _compile(_COMMON_SIGNALS + _BEAUTY_SIGNALS + _ARABIC_SIGNALS),
}


def normalize(text) -> str:
    text = unicodedata.normalize('NFD', str(text or '').lower())
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return re.sub(r'[_\-]', ' ', text)


def parse_tags(value) -> list:
    if not value:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v).strip().lower() for v in value if str(v).strip()]
    return [t.strip().lower() for t in str(value).split(',') if t.strip()]


def humanize_tag(tag: str) -> str:
    """'en:halal-food-authority' → 'Halal food authority'."""
    name = tag.split(':', 1)[1] if ':' in tag else tag
    name = name.replace('-', ' ').replace('_', ' ').strip()
    return name[:1].upper() + name[1:]


def ingredient_signals(text, portal='food') -> list:
    """Libellés des ingrédients sensibles trouvés (sans doublon, ordre d'apparition)."""
    blob = normalize(text)
    if not blob.strip():
        return []
    blob = _WINE_VINEGAR.sub(' ', blob)
    blob = _POULTRY_HAM.sub(' ', blob)
    if portal == 'beauty':
        blob = _FATTY_ALCOHOL.sub(' ', blob)
    found = []
    for label, regex in _SIGNALS.get(portal, _SIGNALS['food']):
        for match in regex.finditer(blob):
            if _NEGATION.search(blob[max(0, match.start() - 24):match.start()]) \
                    or _FREE_AFTER.match(blob, match.end()):
                continue
            if label not in found:
                found.append(label)
            break
    return found


def classify(labels_tags=None, is_halal=None, is_excluded=None, ingredients_text='', portal='food') -> dict:
    tags = parse_tags(labels_tags)
    tag_set = set(tags)
    halal_labels = sorted(t for t in tag_set if 'halal' in t and 'non-halal' not in t)
    exclusion_labels = sorted(tag_set & EXCLUSION_LABELS)
    has_halal = bool(halal_labels) or is_halal is True
    has_exclusion = bool(exclusion_labels) or is_excluded is True
    signals = ingredient_signals(ingredients_text, portal)
    forbidden = [s for s in signals if s in HARAM_SIGNALS]
    has_ingredients = bool((ingredients_text or '').strip())

    reasons = []
    summary = None
    if has_halal and has_exclusion:
        status = DOUBTFUL
        reasons.append({'type': 'conflict', 'text': 'Labels contradictoires : halal et alcool / non halal déclarés.'})
    elif has_exclusion:
        status = HARAM
    elif has_halal:
        status = HALAL
    elif forbidden:
        status, summary = HARAM, SUMMARY_HARAM_INGREDIENTS
    elif signals:
        status = DOUBTFUL
    elif has_ingredients:
        status, summary = HALAL, SUMMARY_HALAL_INGREDIENTS
        reasons.append({'type': 'ingredients-ok', 'text': 'Ni alcool ni porc dans les ingrédients.'})
    else:
        status = UNKNOWN

    for tag in halal_labels:
        reasons.append({'type': 'halal-label', 'text': f'Label déclaré : {humanize_tag(tag)}'})
    for tag in exclusion_labels:
        reasons.append({'type': 'exclusion-label', 'text': f'Label déclaré : {humanize_tag(tag)}'})
    if is_excluded is True and not exclusion_labels:
        reasons.append({'type': 'exclusion-label', 'text': 'Produit signalé comme non conforme.'})
    for label in signals:
        kind = 'Ingrédient interdit' if label in HARAM_SIGNALS else 'Ingrédient sensible'
        reasons.append({'type': 'ingredient', 'text': f'{kind} : {label}'})
    if not has_ingredients:
        reasons.append({'type': 'missing', 'text': 'Liste des ingrédients non renseignée.'})

    return {
        'status': status,
        'label': STATUS_LABEL[status],
        'summary': summary or STATUS_SUMMARY[status],
        'reasons': reasons,
        'halal_labels': halal_labels,
        'exclusion_labels': exclusion_labels,
        'ingredient_signals': signals,
        'verified_certification': False,
    }


def classify_product(product) -> dict:
    data = product.data or {}
    ingredients = product.ingredients_text or data.get('ingredients_text_fr') or data.get('ingredients_text') or ''
    return classify(product.labels_tags, product.is_halal, product.is_excluded, ingredients, product.portal)


def stamp_statuses(products):
    """Calcule et enregistre halal_status sur des Product avant un bulk_create / bulk_update."""
    for product in products:
        product.halal_status = classify_product(product)['status']
    return products
