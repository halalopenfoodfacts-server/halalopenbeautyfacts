// Garde-fous du widget Halal Assistant (core/js/ui/assistant.js), vérifiés sur le source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../../js/ui/assistant.js', import.meta.url), 'utf8');

test('le texte du modèle n\'est jamais injecté comme HTML', () => {
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(source));
});

test('seuls nos deux sites deviennent des liens', () => {
    const match = source.match(/const OWN_LINK = (\/.*\/g);/);
    assert.ok(match);
    const OWN_LINK = eval(match[1]);   // eslint-disable-line no-eval
    const sample = 'Voir https://halalopenfoodfacts.org/product.html?code=1 et https://evil.example/x ou https://halalopenbeautyfacts.org/';
    assert.deepEqual(sample.match(OWN_LINK), ['https://halalopenfoodfacts.org/product.html?code=1', 'https://halalopenbeautyfacts.org/']);
});

test('aucune clé API ni appel direct à Anthropic côté navigateur', () => {
    assert.ok(!/anthropic\.com|sk-ant|x-api-key/i.test(source));
    assert.ok(source.includes("fetch('/proxy/v2/assistant'"));
});

test('limites envoyées au serveur : 500 caractères, 6 messages d\'historique', () => {
    assert.ok(source.includes('const MAX_QUESTION = 500;'));
    assert.ok(source.includes('const MAX_HISTORY = 6;'));
});
