"""URL des photos « face avant » des produits Open Food / Beauty Facts.

Les fichiers delta JSONL ne contiennent pas `image_front_small_url` / `image_front_url` :
l'API OFF les calcule à la volée à partir de `images.selected.front.<langue>.rev`.
Les recopier tels quels effaçait la photo de chaque produit mis à jour (oct. 2026).
"""
import json
import urllib.request

IMAGE_DOMAINS = {
    'food': 'images.openfoodfacts.org',
    'beauty': 'images.openbeautyfacts.org',
}
API_DOMAINS = {
    'food': 'world.openfoodfacts.org',
    'beauty': 'world.openbeautyfacts.org',
}
USER_AGENT = 'HalalOpenFoodFacts/1.0 (contact@halalopenfoodfacts.org)'
PREFERRED_LANGS = ('fr', 'en', 'ar', 'es')


def product_path(code: str) -> str:
    """Chemin OFF : 01771879 → 000/000/177/1879 ; 3017620422003 → 301/762/042/2003."""
    code = str(code).strip()
    if code.isdigit() and len(code) < 13:
        code = code.zfill(13)
    if code.isdigit() and len(code) > 8:
        return f'{code[0:3]}/{code[3:6]}/{code[6:9]}/{code[9:]}'
    return code


def _selected_fronts(images: dict) -> dict:
    """{langue: rev} — format actuel (images.selected.front.fr) et ancien (images.front_fr)."""
    fronts = {}
    selected = (images.get('selected') or {}).get('front') or {}
    if isinstance(selected, dict):
        for lang, info in selected.items():
            if isinstance(info, dict) and info.get('rev') not in (None, ''):
                fronts[lang] = info['rev']
    for key, info in images.items():
        if key.startswith('front_') and isinstance(info, dict) and info.get('rev') not in (None, ''):
            fronts.setdefault(key[len('front_'):], info['rev'])
    return fronts


def front_image_urls(code: str, images, portal: str = 'food', lang: str = '') -> tuple[str, str]:
    """(vignette 200 px, image 400 px), ou ('', '') si aucune photo de face n'est sélectionnée."""
    if not isinstance(images, dict):
        return '', ''
    fronts = _selected_fronts(images)
    if not fronts:
        return '', ''
    for candidate in PREFERRED_LANGS + ((lang,) if lang else ()) + tuple(sorted(fronts)):
        if candidate in fronts:
            chosen = candidate
            break
    rev = fronts[chosen]
    base = f'https://{IMAGE_DOMAINS.get(portal, IMAGE_DOMAINS["food"])}/images/products/{product_path(code)}/front_{chosen}.{rev}'
    return f'{base}.200.jpg', f'{base}.400.jpg'


def fetch_front_images(code: str, portal: str = 'food', timeout: int = 10) -> tuple[str, str]:
    """Demande à l'API produit OFF les URL de la photo de face (une requête)."""
    domain = API_DOMAINS.get(portal, API_DOMAINS['food'])
    url = f'https://{domain}/api/v2/product/{code}.json?fields=image_front_small_url,image_front_url'
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        product = json.loads(response.read()).get('product') or {}
    small = str(product.get('image_front_small_url') or '')
    full = str(product.get('image_front_url') or '')
    return (small if small.startswith('https://') else ''), (full if full.startswith('https://') else '')
