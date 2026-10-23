"""
Pays réels : les 195 États reconnus (193 membres de l'ONU + Vatican et Palestine, États observateurs).

Les étiquettes « pays » d'Open Food Facts sont libres : on y trouve des fautes, des régions
(« provence »), des continents (« en:europe », « en:world »), des territoires (Réunion, Porto Rico)
et le même pays écrit dans plusieurs langues (« en:frankreich », « en:allemagne »).
Pour compter les pays, chaque étiquette est rattachée à son code ISO 3166-1 s'il s'agit d'un État.
"""
import re
import unicodedata

# (code ISO, étiquette Open Food Facts, autres écritures rencontrées)
STATES = [
    ('AF', 'afghanistan', ''), ('AL', 'albania', 'albanie'), ('DZ', 'algeria', 'algerie argelia'),
    ('AD', 'andorra', 'andorre'), ('AO', 'angola', ''), ('AG', 'antigua-and-barbuda', ''),
    ('AR', 'argentina', 'argentine'), ('AM', 'armenia', 'armenie'), ('AU', 'australia', 'australie australien'),
    ('AT', 'austria', 'autriche osterreich'), ('AZ', 'azerbaijan', ''), ('BS', 'the-bahamas', 'bahamas'),
    ('BH', 'bahrain', 'bahrein'), ('BD', 'bangladesh', ''), ('BB', 'barbados', ''),
    ('BY', 'belarus', 'bielorussie'), ('BE', 'belgium', 'belgique belgien belgica belgio belgie'), ('BZ', 'belize', ''),
    ('BJ', 'benin', ''), ('BT', 'bhutan', ''), ('BO', 'bolivia', 'bolivie'),
    ('BA', 'bosnia-and-herzegovina', 'bosnia bosnie'), ('BW', 'botswana', ''), ('BR', 'brazil', 'bresil brasil'),
    ('BN', 'brunei', 'brunei-darussalam'), ('BG', 'bulgaria', 'bulgarie'), ('BF', 'burkina-faso', ''),
    ('BI', 'burundi', ''), ('CV', 'cape-verde', 'cabo-verde'), ('KH', 'cambodia', 'cambodge'),
    ('CM', 'cameroon', 'cameroun'), ('CA', 'canada', ''), ('CF', 'central-african-republic', ''),
    ('TD', 'chad', 'tchad'), ('CL', 'chile', 'chili'), ('CN', 'china', 'chine'),
    ('CO', 'colombia', 'colombie'), ('KM', 'comoros', 'comores'), ('CG', 'republic-of-the-congo', 'congo'),
    ('CD', 'democratic-republic-of-the-congo', 'congo-kinshasa'), ('CR', 'costa-rica', ''),
    ('CI', 'cote-d-ivoire', 'ivory-coast'), ('HR', 'croatia', 'croatie'), ('CU', 'cuba', ''),
    ('CY', 'cyprus', 'chypre'), ('CZ', 'czech-republic', 'czechia cesko republique-tcheque'),
    ('DK', 'denmark', 'danemark'), ('DJ', 'djibouti', ''), ('DM', 'dominica', ''),
    ('DO', 'dominican-republic', ''), ('EC', 'ecuador', 'equateur'), ('EG', 'egypt', 'egypte'),
    ('SV', 'el-salvador', ''), ('GQ', 'equatorial-guinea', ''), ('ER', 'eritrea', ''),
    ('EE', 'estonia', 'estonie'), ('SZ', 'eswatini', 'swaziland'), ('ET', 'ethiopia', 'ethiopie'),
    ('FJ', 'fiji', ''), ('FI', 'finland', 'finlande'),
    ('FR', 'france', 'frankreich francia frankrijk'),
    ('GA', 'gabon', ''), ('GM', 'gambia', 'the-gambia'), ('GE', 'georgia', 'georgie'),
    ('DE', 'germany', 'allemagne deutschland alemania germania'), ('GH', 'ghana', ''),
    ('GR', 'greece', 'grece ellada'), ('GD', 'grenada', ''), ('GT', 'guatemala', ''),
    ('GN', 'guinea', 'guinee'), ('GW', 'guinea-bissau', ''), ('GY', 'guyana', ''), ('HT', 'haiti', ''),
    ('HN', 'honduras', ''), ('HU', 'hungary', 'hongrie magyarorszag'), ('IS', 'iceland', 'islande'),
    ('IN', 'india', 'inde'), ('ID', 'indonesia', 'indonesie'), ('IR', 'iran', ''), ('IQ', 'iraq', 'irak'),
    ('IE', 'ireland', 'irlande irland'), ('IL', 'israel', ''), ('IT', 'italy', 'italie italien italia'),
    ('JM', 'jamaica', 'jamaique'), ('JP', 'japan', 'japon'), ('JO', 'jordan', 'jordanie'),
    ('KZ', 'kazakhstan', ''), ('KE', 'kenya', ''), ('KI', 'kiribati', ''), ('KW', 'kuwait', 'koweit'),
    ('KG', 'kyrgyzstan', ''), ('LA', 'laos', ''), ('LV', 'latvia', 'lettonie'),
    ('LB', 'lebanon', 'liban'), ('LS', 'lesotho', ''), ('LR', 'liberia', ''), ('LY', 'libya', 'libye'),
    ('LI', 'liechtenstein', ''), ('LT', 'lithuania', 'lituanie'), ('LU', 'luxembourg', ''),
    ('MG', 'madagascar', ''), ('MW', 'malawi', ''), ('MY', 'malaysia', 'malaisie'), ('MV', 'maldives', ''),
    ('ML', 'mali', ''), ('MT', 'malta', 'malte'), ('MH', 'marshall-islands', ''),
    ('MR', 'mauritania', 'mauritanie'), ('MU', 'mauritius', 'maurice'), ('MX', 'mexico', 'mexique'),
    ('FM', 'micronesia', 'federated-states-of-micronesia'), ('MD', 'moldova', 'moldavie'),
    ('MC', 'monaco', ''), ('MN', 'mongolia', 'mongolie'), ('ME', 'montenegro', ''),
    ('MA', 'morocco', 'maroc marruecos'), ('MZ', 'mozambique', ''), ('MM', 'myanmar', 'burma birmanie'),
    ('NA', 'namibia', 'namibie'), ('NR', 'nauru', ''), ('NP', 'nepal', ''),
    ('NL', 'netherlands', 'pays-bas nederland holland'),
    ('NZ', 'new-zealand', 'nouvelle-zelande'), ('NI', 'nicaragua', ''), ('NE', 'niger', ''),
    ('NG', 'nigeria', ''), ('KP', 'north-korea', 'coree-du-nord'),
    ('MK', 'north-macedonia', 'republic-of-macedonia macedonia macedoine'), ('NO', 'norway', 'norvege'),
    ('OM', 'oman', ''), ('PK', 'pakistan', ''), ('PW', 'palau', ''),
    ('PS', 'state-of-palestine', 'palestinian-territories palestine'), ('PA', 'panama', ''),
    ('PG', 'papua-new-guinea', ''), ('PY', 'paraguay', ''), ('PE', 'peru', 'perou'),
    ('PH', 'philippines', ''), ('PL', 'poland', 'pologne polonia polska'), ('PT', 'portugal', ''),
    ('QA', 'qatar', ''), ('RO', 'romania', 'roumanie rumania roemenie'), ('RU', 'russia', 'russie'),
    ('RW', 'rwanda', ''), ('KN', 'saint-kitts-and-nevis', 'st-kitts-and-nevis'), ('LC', 'saint-lucia', ''),
    ('VC', 'saint-vincent-and-the-grenadines', 'st-vincent-and-grenadines'), ('WS', 'samoa', ''),
    ('SM', 'san-marino', ''), ('ST', 'sao-tome-and-principe', ''),
    ('SA', 'saudi-arabia', 'arabie-saoudite saudi'), ('SN', 'senegal', ''), ('RS', 'serbia', 'serbie'),
    ('SC', 'seychelles', ''), ('SL', 'sierra-leone', ''), ('SG', 'singapore', 'singapour'),
    ('SK', 'slovakia', 'slovaquie'), ('SI', 'slovenia', 'slovenie'), ('SB', 'solomon-islands', ''),
    ('SO', 'somalia', 'somalie'), ('ZA', 'south-africa', 'afrique-du-sud'),
    ('KR', 'south-korea', 'coree-du-sud'), ('SS', 'south-sudan', ''),
    ('ES', 'spain', 'espagne espana'), ('LK', 'sri-lanka', ''), ('SD', 'sudan', 'soudan'),
    ('SR', 'suriname', ''), ('SE', 'sweden', 'suede'), ('CH', 'switzerland', 'suisse schweiz suiza svizzera'),
    ('SY', 'syria', 'syrie'), ('TJ', 'tajikistan', ''), ('TZ', 'tanzania', 'tanzanie'),
    ('TH', 'thailand', 'thailande'), ('TL', 'timor-leste', 'east-timor'), ('TG', 'togo', ''),
    ('TO', 'tonga', ''), ('TT', 'trinidad-and-tobago', ''), ('TN', 'tunisia', 'tunisie'),
    ('TR', 'turkey', 'turkiye turquie'), ('TM', 'turkmenistan', ''), ('TV', 'tuvalu', ''),
    ('UG', 'uganda', 'ouganda'), ('UA', 'ukraine', ''),
    ('AE', 'united-arab-emirates', 'emirats-arabes-unis'),
    ('GB', 'united-kingdom', 'royaume-uni great-britain uk scotland wales england angleterre'),
    ('US', 'united-states', 'usa etats-unis vereinigte-staaten-von-amerika stany-zjednoczone stati-uniti-d-america en-us'),
    ('UY', 'uruguay', ''), ('UZ', 'uzbekistan', 'ouzbekistan'), ('VU', 'vanuatu', ''),
    ('VA', 'vatican-city', 'holy-see vatican'), ('VE', 'venezuela', ''), ('VN', 'vietnam', 'viet-nam'),
    ('YE', 'yemen', ''), ('ZM', 'zambia', 'zambie'), ('ZW', 'zimbabwe', ''),
]

# Écritures non latines vues dans la base (rattachées telles quelles)
_NON_LATIN = {
    'فرنسا': 'FR', 'كندا': 'CA', 'فلسطين': 'PS', 'المغرب': 'MA', 'الاردن': 'JO', 'تونس': 'TN',
    'ישראל': 'IL', 'ελλαδα': 'GR', 'българия': 'BG', 'україна': 'UA', 'казахстан': 'KZ',
    'нидерланды': 'NL', '日本': 'JP', '대한민국': 'KR', 'アメリカ合衆国': 'US', 'ประเทศไทย-thai': 'TH',
    '泰國': 'TH', 'ශ්‍රී-ලංකාව': 'LK',
}


def _slug(value: str) -> str:
    value = unicodedata.normalize('NFD', value.strip().lower())
    value = ''.join(c for c in value if unicodedata.category(c) != 'Mn')
    return re.sub(r'[\s_]+', '-', value).strip('-')


ISO_BY_SLUG = {}
for _iso, _tag, _aliases in STATES:
    for _name in [_tag, *_aliases.split()]:
        ISO_BY_SLUG[_slug(_name).rstrip('-')] = _iso
ISO_BY_SLUG.update({_slug(k): v for k, v in _NON_LATIN.items()})
CANONICAL_TAG = {iso: f'en:{tag}' for iso, tag, _ in STATES}

assert len(STATES) == 195, len(STATES)


def country_iso(tag: str):
    """'en:frankreich' → 'FR' ; 'en:world', 'fr:provence', 'en:reunion' → None."""
    value = tag.split(':', 1)[1] if ':' in tag else tag
    return ISO_BY_SLUG.get(_slug(value))


def real_countries(rows):
    """[(étiquette, produits)] → [(code ISO, étiquette OFF, produits)] des seuls États, regroupés."""
    totals = {}
    for tag, count in rows:
        iso = country_iso(tag)
        if iso:
            totals[iso] = totals.get(iso, 0) + count
    return sorted(((iso, CANONICAL_TAG[iso], n) for iso, n in totals.items()), key=lambda item: -item[2])
