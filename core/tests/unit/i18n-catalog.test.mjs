import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createCatalog, normalizeText } from '../../js/lib/i18n-catalog.js';

test('texte exact, espaces conservés autour', () => {
    const catalog = createCatalog({ 'Tout voir': 'See all', Inutilisé: null });
    assert.equal(catalog.translateText('  Tout   voir \n'), '  See all \n');
    assert.equal(catalog.translateText('Inutilisé'), null);
    assert.equal(catalog.translateText('Inconnu'), null);
});

test('partie variable {x} recopiée, ou traduite si elle est elle-même au catalogue', () => {
    const catalog = createCatalog({
        'Résultats pour « {x} »': 'Results for "{x}"',
        'Ingrédient interdit : {x}': 'Forbidden ingredient: {x}',
        porc: 'pork',
        'Question {x} / {x}': 'Question {x} of {x}',
    });
    assert.equal(catalog.lookup('Résultats pour « nutella »'), 'Results for "nutella"');
    assert.equal(catalog.lookup('Ingrédient interdit : porc'), 'Forbidden ingredient: pork');
    assert.equal(catalog.lookup('Question 2 / 5'), 'Question 2 of 5');
});

test('catalogues : mêmes {x} que la source, aucune traduction vide', () => {
    for (const lang of ['en', 'ar', 'es']) {
        const entries = JSON.parse(readFileSync(new URL(`../../i18n/${lang}.json`, import.meta.url), 'utf8'));
        for (const [source, target] of Object.entries(entries)) {
            if (target == null) continue;
            assert.notEqual(normalizeText(target), '', `${lang} : ${source}`);
            assert.equal(target.split('{x}').length, source.split('{x}').length, `${lang} : ${source}`);
        }
    }
});
