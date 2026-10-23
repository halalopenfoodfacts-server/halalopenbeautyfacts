import { api } from '../lib/api.js';
import { formatNumber, formatRelative } from '../lib/format.js';
import { html } from '../lib/html.js';
import { lists } from '../lib/storage.js';
import { countUp } from '../ui/countup.js';
import { $, $$, setHtml } from '../ui/dom.js';
import { currentLang } from '../ui/i18n-dom.js';
import { initShell } from '../ui/shell.js';
import { renderError } from '../ui/state.js';

initShell();

async function loadStats() {
    try {
        const stats = await api.stats();
        $$('[data-stat]').forEach((element) => countUp(element, Number(stats[element.dataset.stat])));
        if (stats.computed_at) $('[data-computed]').textContent = `Dernier calcul ${formatRelative(Date.parse(stats.computed_at) / 1000, currentLang())}.`;
        $('[data-stats-error]').innerHTML = '';
    } catch (error) {
        renderError($('[data-stats-error]'), error, loadStats);
        if (error.kind === 'computing') setTimeout(loadStats, Math.min((error.retryAfter || 60) * 1000, 120000));
    }
}

async function loadFacet(type) {
    const list = $(`[data-facet="${type}"]`);
    list.innerHTML = '<li class="skeleton" style="height:9rem"></li>';
    try {
        const { tags = [] } = await api.facet(type);
        const top = tags.slice(0, 10);
        const max = top[0]?.products || 1;
        const lang = currentLang();
        setHtml(list, html`${top.map((tag) => html`<li><span class="row"><span>${tag.name}</span><span>${formatNumber(tag.products, lang)}</span></span><span class="bar" aria-hidden="true"><span style="width:${((tag.products / max) * 100).toFixed(1)}%"></span></span></li>`)}`);
    } catch (error) {
        renderError(list, error, () => loadFacet(type));
    }
}

function personal() {
    const history = lists.history();
    const tiles = [
        ['Produits consultés', history.length, '/my-lists.html?liste=history'],
        ['Favoris', lists.get('fav').length, '/my-lists.html?liste=fav'],
        ['Liste de courses', lists.get('cart').length, '/my-lists.html?liste=cart'],
        ['À éviter', lists.get('black').length, '/my-lists.html?liste=black'],
    ];
    setHtml($('[data-personal]'), html`${tiles.map(([label, value, href]) => html`<a class="stat" href="${href}"><span class="stat__value">${value}</span><span class="stat__label">${label}</span></a>`)}`);
}

loadStats();
loadFacet('countries');
loadFacet('labels');
personal();
