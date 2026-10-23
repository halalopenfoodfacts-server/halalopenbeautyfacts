import { api } from '../lib/api.js';
import { html } from '../lib/html.js';
import { bindImageFallbacks, productCard, skeletonCards } from '../ui/card.js';
import { countUp } from '../ui/countup.js';
import { $, $$, setHtml } from '../ui/dom.js';
import { t } from '../ui/i18n-dom.js';
import { initSearchBox } from '../ui/search-box.js';
import { initShell } from '../ui/shell.js';

initShell();
$$('[data-search-form]').forEach((form) => initSearchBox(form));

// Anciens liens « index.html#catalogue » → nouveau catalogue
if (window.location.hash === '#catalogue') window.location.replace('/catalogue.html');

async function loadStats(attempt = 0) {
    const values = $$('[data-stat]');
    try {
        const stats = await api.stats();
        values.forEach((element) => countUp(element, Number(stats[element.dataset.stat])));
    } catch (error) {
        // 503 « computing » : le backend calcule les chiffres, on réessaie après le délai annoncé
        if (error.kind === 'computing' && attempt < 3) {
            setTimeout(() => loadStats(attempt + 1), Math.min((error.retryAfter || 30) * 1000, 60000));
            return;
        }
        values.forEach((element) => { element.textContent = '—'; element.title = t('error.server'); });
    }
}

async function loadRail(name, loader) {
    const rail = $(`[data-rail="${name}"]`);
    if (!rail) return;
    setHtml(rail, skeletonCards(6));
    try {
        const { products = [] } = await loader();
        rail.setAttribute('aria-busy', 'false');
        if (!products.length) { rail.closest('section').hidden = true; return; }
        setHtml(rail, html`${products.slice(0, 12).map((product, index) => productCard(product, index))}`);
        bindImageFallbacks(rail);
    } catch {
        rail.setAttribute('aria-busy', 'false');
        rail.closest('section').hidden = true;   // section secondaire : on la masque plutôt qu'afficher une erreur
    }
}

function initVoyage() {
    const group = $('[data-voyage]');
    if (!group) return;
    const flag = $('[data-voyage-flag]');
    const title = $('[data-voyage-title]');
    const text = $('[data-voyage-text]');
    const link = $('[data-voyage-link]');
    group.addEventListener('click', (event) => {
        const button = event.target.closest('[data-country]');
        if (!button) return;
        $$('[data-country]', group).forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
        flag.textContent = button.dataset.flag;
        title.textContent = button.dataset.title;
        text.textContent = button.dataset.text;
        link.href = `/catalogue.html?pays=en:${encodeURIComponent(button.dataset.country)}`;
    });
}

loadStats();
loadRail('top', () => api.top(12));
loadRail('recent', () => api.recent(12));
initVoyage();
