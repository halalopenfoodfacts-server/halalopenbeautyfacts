// Configuration publique du portail, injectée au build (esbuild define __SITE__).
/* global __SITE__, __ZXING_URL__ */
export const SITE = typeof __SITE__ !== 'undefined' ? __SITE__ : {
    portal: 'food',
    name: 'Halal Open Food Facts',
    domain: 'http://localhost',
    upstream: { name: 'Open Food Facts', productUrl: 'https://world.openfoodfacts.org/product/', addUrl: '' },
    features: { nutrition: true },
    sensitiveIngredients: [],
};
export const ZXING_URL = typeof __ZXING_URL__ !== 'undefined' ? __ZXING_URL__ : '';
