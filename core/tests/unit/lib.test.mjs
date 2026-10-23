import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeEan, barcodeSvg, isValidGtin, looksLikeBarcode, normalizeBarcode } from '../../js/lib/barcode.js';
import { cleanTag, formatNumber, formatQuantity, formatRelative, tagList } from '../../js/lib/format.js';
import { highlightRanges, statusOf } from '../../js/lib/halal.js';
import { escapeHtml, html, raw, safeUrl } from '../../js/lib/html.js';
import { LANGS, missingTranslations, normalizeLang, translate } from '../../js/lib/i18n.js';
import { activeFilterCount, MAX_PAGE, parseState, serializeState, toApiParams } from '../../js/lib/query.js';
import { createLists, createStore } from '../../js/lib/storage.js';

test('html échappe les valeurs interpolées (XSS)', () => {
    const name = '<img src=x onerror=alert(1)>"\'';
    assert.equal(String(html`<p title="${name}">${name}</p>`),
        '<p title="&lt;img src=x onerror=alert(1)&gt;&quot;&#39;">&lt;img src=x onerror=alert(1)&gt;&quot;&#39;</p>');
    assert.equal(String(html`<ul>${['<a>', raw('<b>ok</b>')]}</ul>`), '<ul>&lt;a&gt;<b>ok</b></ul>');
    assert.equal(String(html`${null}${false}${undefined}${0}`), '0');
    assert.equal(escapeHtml('`'), '&#96;');
});

test('safeUrl refuse javascript: et data:', () => {
    assert.equal(safeUrl('javascript:alert(1)'), '');
    assert.equal(safeUrl('data:text/html,x'), '');
    assert.equal(safeUrl('//evil.example/x'), '');
    assert.equal(safeUrl('https://images.openfoodfacts.org/a.jpg'), 'https://images.openfoodfacts.org/a.jpg');
});

test('codes-barres : clé de contrôle GS1', () => {
    assert.ok(isValidGtin('3017620422003'));       // EAN-13 Nutella
    assert.ok(isValidGtin('87120158'));            // EAN-8
    assert.ok(isValidGtin('012345678905'));        // UPC-A
    assert.ok(!isValidGtin('3017620422004'));
    assert.ok(!isValidGtin('12345'));
    assert.equal(normalizeBarcode(' 3017 6204-22003 '), '3017620422003');
    assert.ok(looksLikeBarcode('3017620422003') && !looksLikeBarcode('nutella'));
});

test('codes-barres : encodage EAN-13 / EAN-8', () => {
    const bits = encodeEan('3017620422003');
    assert.equal(bits.length, 95);
    assert.ok(bits.startsWith('101') && bits.endsWith('101') && bits.slice(45, 50) === '01010');
    assert.equal(encodeEan('87120158').length, 67);
    assert.equal(encodeEan('3017620422004'), null);
    assert.match(barcodeSvg('3017620422003'), /^<svg[^>]+role="img"/);
    assert.equal(barcodeSvg('abc'), '');
});

test('formatage', () => {
    assert.equal(cleanTag('en:halal-food-authority'), 'Halal food authority');
    assert.deepEqual(tagList('en:a, en:b,,'), ['en:a', 'en:b']);
    assert.deepEqual(tagList(['x', '']), ['x']);
    assert.equal(formatNumber(4568714, 'fr').replace(/\s/g, ' '), '4 568 714');
    assert.equal(formatNumber(undefined), '—');
    assert.equal(formatQuantity(2.94, 'g', 'fr'), '2,9 g');
    assert.equal(formatQuantity(null, 'g'), '—');
    assert.equal(formatRelative(1000, 'fr', 1000 * 1000 + 2 * 86400 * 1000), 'avant-hier');
});

test('statut halal et mise en évidence des ingrédients', () => {
    assert.equal(statusOf({ halal_status: 'haram' }), 'haram');
    assert.equal(statusOf({ halal_status: 'nimporte' }), 'unknown');
    assert.equal(statusOf(null), 'unknown');
    const text = 'Sucre, Gélatine de porc, vinaigre';
    const ranges = highlightRanges(text, ['gelatines?', 'porc', 'vins?']);
    assert.deepEqual(ranges.map(([a, b]) => text.slice(a, b)), ['Gélatine', 'porc']);   // pas « vin » dans vinaigre
});

test('catalogue : URL ⇄ état ⇄ API', () => {
    const state = parseState('?q=lait&statut=halal&label=en:organic&label=en:vegan&nutriscore=a,b&nova=9&palme=0&tri=recent&page=3');
    assert.deepEqual(state.labels, ['en:organic', 'en:vegan']);
    assert.deepEqual(state.nutriscore, ['a', 'b']);
    assert.deepEqual(state.nova, []);
    assert.equal(state.page, 3);
    assert.equal(activeFilterCount(state), 6);
    const back = parseState(`?${serializeState(state)}`);
    assert.deepEqual(back, state);
    const params = toApiParams(state);
    assert.equal(params.is_halal, '1');
    assert.equal(params.sort_by, undefined);    // tri par pertinence quand il y a un texte
    assert.equal(params.palm_oil_free, '1');
    assert.equal(parseState('?page=99999').page, MAX_PAGE);
    assert.equal(parseState('?page=abc').page, 1);
    assert.equal(parseState('?statut=evil').status, '');
    const preset = parseState('', { status: 'haram' });
    assert.equal(toApiParams(preset).is_excluded, '1');
    assert.equal(serializeState(preset, { status: 'haram' }), '');
});

function memoryBackend() {
    const data = new Map();
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), data };
}

test('listes locales : anciens formats conservés, bascule, historique', () => {
    const backend = memoryBackend();
    backend.setItem('halal_fav', JSON.stringify([{ code: '123', name: 'Ancien', brand: 'B', img: '' }]));
    const lists = createLists(createStore(backend));
    assert.equal(lists.get('fav')[0].name, 'Ancien');
    assert.ok(lists.has('fav', '123'));
    assert.equal(lists.toggle('fav', { code: '456', product_name: 'Nouveau' }), true);
    assert.equal(lists.toggle('fav', { code: '456' }), false);
    lists.remember({ code: '1' });
    lists.remember({ code: '2' });
    lists.remember({ code: '1' });
    assert.deepEqual(lists.history().map((i) => i.code), ['1', '2']);
    lists.setCompare(['a', 'b', 'c', 'd']);
    assert.deepEqual(lists.compare(), ['a', 'b', 'c']);
});

test('stockage indisponible : aucune exception', () => {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
    const store = createStore(broken);
    assert.deepEqual(store.read('x', []), []);
    assert.equal(store.write('x', 1), false);
    assert.deepEqual(createLists(store).get('fav'), []);
    backendJsonCorrupt();
});

function backendJsonCorrupt() {
    const backend = memoryBackend();
    backend.setItem('halal_cart', '{pas du json');
    assert.deepEqual(createLists(createStore(backend)).get('cart'), []);
}

test('i18n : toutes les clés traduites dans les 4 langues', () => {
    assert.deepEqual(missingTranslations(), []);
    assert.equal(translate('results.count', 'en', { n: 3 }), '3 products');
    assert.equal(translate('clé.inconnue', 'fr'), 'clé.inconnue');
    assert.equal(normalizeLang('ar-MA'), 'ar');
    assert.equal(normalizeLang('de'), 'fr');
    assert.deepEqual(LANGS, ['fr', 'en', 'ar', 'es']);
});

test('pays deviné par le fuseau horaire', async () => {
    const { guessCountry } = await import('../../js/lib/country.js');
    assert.equal(guessCountry('Africa/Casablanca'), 'morocco');
    assert.equal(guessCountry('Europe/Paris'), 'france');
    assert.equal(guessCountry('Pacific/Fiji'), '');
});
