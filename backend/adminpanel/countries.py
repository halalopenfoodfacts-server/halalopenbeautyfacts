"""Nom français des pays les plus fréquents ; les autres prennent le nom anglais de l'ISO 3166."""
from functools import lru_cache

FRENCH = {
    'FR': 'France', 'BE': 'Belgique', 'CH': 'Suisse', 'LU': 'Luxembourg', 'MC': 'Monaco', 'CA': 'Canada',
    'MA': 'Maroc', 'DZ': 'Algérie', 'TN': 'Tunisie', 'LY': 'Libye', 'EG': 'Égypte', 'MR': 'Mauritanie',
    'SN': 'Sénégal', 'ML': 'Mali', 'CI': 'Côte d\'Ivoire', 'GN': 'Guinée', 'CM': 'Cameroun', 'NE': 'Niger',
    'BF': 'Burkina Faso', 'TD': 'Tchad', 'KM': 'Comores', 'DJ': 'Djibouti', 'GB': 'Royaume-Uni', 'IE': 'Irlande',
    'US': 'États-Unis', 'DE': 'Allemagne', 'AT': 'Autriche', 'NL': 'Pays-Bas', 'ES': 'Espagne', 'PT': 'Portugal',
    'IT': 'Italie', 'GR': 'Grèce', 'SE': 'Suède', 'NO': 'Norvège', 'DK': 'Danemark', 'FI': 'Finlande',
    'PL': 'Pologne', 'RO': 'Roumanie', 'BA': 'Bosnie-Herzégovine', 'AL': 'Albanie', 'XK': 'Kosovo',
    'TR': 'Turquie', 'SA': 'Arabie saoudite', 'AE': 'Émirats arabes unis', 'QA': 'Qatar', 'KW': 'Koweït',
    'BH': 'Bahreïn', 'OM': 'Oman', 'JO': 'Jordanie', 'LB': 'Liban', 'IQ': 'Irak', 'IR': 'Iran', 'PS': 'Palestine',
    'PK': 'Pakistan', 'IN': 'Inde', 'BD': 'Bangladesh', 'ID': 'Indonésie', 'MY': 'Malaisie', 'SG': 'Singapour',
    'AU': 'Australie', 'NZ': 'Nouvelle-Zélande', 'BR': 'Brésil', 'MX': 'Mexique', 'RU': 'Russie', 'CN': 'Chine',
    'JP': 'Japon', 'NG': 'Nigeria', 'ZA': 'Afrique du Sud', 'RE': 'La Réunion', 'GP': 'Guadeloupe',
    'MQ': 'Martinique', 'GF': 'Guyane', 'YT': 'Mayotte', 'NC': 'Nouvelle-Calédonie',
}


@lru_cache(maxsize=1)
def _iso_names():
    names = {}
    try:
        with open('/usr/share/zoneinfo/iso3166.tab', encoding='utf-8') as fh:
            for line in fh:
                if not line.startswith('#') and '\t' in line:
                    code, name = line.rstrip('\n').split('\t', 1)
                    names[code] = name
    except OSError:
        pass
    return names


def flag(code):
    return ''.join(chr(0x1F1E6 + ord(c) - ord('A')) for c in code) if len(code) == 2 and code.isalpha() else ''


def country_label(code):
    return f'{flag(code)} {FRENCH.get(code) or _iso_names().get(code) or code}'.strip()
