import assert from 'node:assert/strict';
import { test } from 'node:test';
import { render, splitFrontMatter } from '../../tools/template.mjs';

test('variables échappées et brutes', () => {
    assert.equal(render('<p>{{a.b}}</p>{{{c}}}', { a: { b: '<x>' }, c: '<y>' }), '<p>&lt;x&gt;</p><y>');
    assert.equal(render('{{missing.deep}}', {}), '');
});

test('if / else / unless / each imbriqués', () => {
    const tpl = '{{#each items}}{{#if this.on}}[{{this.n}}]{{else}}-{{/if}}{{/each}}{{#unless items}}vide{{/unless}}';
    assert.equal(render(tpl, { items: [{ on: true, n: 1 }, { on: false }] }), '[1]-');
    assert.equal(render(tpl, { items: [] }), 'vide');
    assert.equal(render('{{#each l}}{{index}}{{/each}}', { l: ['a', 'b'] }), '01');
});

test('fragments et erreurs explicites', () => {
    assert.equal(render('{{> p}}', { x: 1 }, { p: '<b>{{x}}</b>' }), '<b>1</b>');
    assert.throws(() => render('{{> absent}}', {}, {}), /Fragment introuvable/);
    assert.throws(() => render('{{#if a}}', {}), /non fermé/);
});

test('en-tête JSON des pages', () => {
    const { meta, body } = splitFrontMatter('---\n{"title": "T"}\n---\n<main></main>');
    assert.deepEqual(meta, { title: 'T' });
    assert.equal(body, '<main></main>');
});
