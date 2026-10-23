// « La base en chiffres » (accueil) : répartition des statuts halal, Nutri-Score, communauté.
// Graphiques en HTML/CSS : chaque marque porte une icône ou une lettre et sa valeur écrite
// (jamais la couleur seule) ; le détail s'affiche au survol, au toucher et au clavier.
import { formatCompact, formatNumber } from '../lib/format.js';
import { html } from '../lib/html.js';
import { setHtml } from './dom.js';
import { currentLang, t } from './i18n-dom.js';
import { statusBadge } from './status.js';
import { bindTooltips } from './tooltip.js';

const STATUS_ORDER = [
    ['halal', 'halal', '/catalogue.html?statut=halal'],
    ['haram', 'excluded', '/excluded.html'],
    ['doubtful', 'doubtful', '/catalogue.html?statut=doubtful'],
    ['unknown', 'unknown', '/a-completer.html'],
];
const GRADES = ['a', 'b', 'c', 'd', 'e'];

const percent = (part, whole, lang) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: part / whole < 0.1 ? 1 : 0 }).format(whole ? part / whole : 0);

function statusChart(box, stats, lang) {
    const max = Math.max(...STATUS_ORDER.map(([, key]) => stats[key] || 0), 1);
    setHtml(box, html`${STATUS_ORDER.map(([status, key, href]) => {
        const value = stats[key] || 0;
        const share = percent(value, stats.total, lang);
        const label = t(`status.${status}`);
        return html`<li><a class="barlist__row" href="${href}" data-tip="${label} : ${formatNumber(value, lang)} (${share})">
            <span class="barlist__label">${statusBadge(status)}</span>
            <span class="barlist__track"><span class="barlist__bar barlist__bar--${status}" style="--w:${((value / max) * 100).toFixed(2)}%"></span></span>
            <span class="barlist__value">${formatCompact(value, lang)} <small>${share}</small></span>
        </a></li>`;
    })}`);
}

function nutriscoreChart(box, stats, lang) {
    const counts = stats.nutriscore || {};
    const rated = GRADES.reduce((sum, grade) => sum + (counts[grade] || 0), 0);
    const max = Math.max(...GRADES.map((grade) => counts[grade] || 0), 1);
    setHtml(box, html`${GRADES.map((grade) => {
        const value = counts[grade] || 0;
        const tip = `Nutri-Score ${grade.toUpperCase()} : ${formatNumber(value, lang)} (${percent(value, rated, lang)})`;
        return html`<a class="columns__col" href="/catalogue.html?nutriscore=${grade}" data-tip="${tip}" aria-label="${tip}">
            <span class="columns__value">${formatCompact(value, lang)}</span>
            <span class="columns__plot"><span class="columns__bar columns__bar--${grade}" style="--h:${((value / max) * 100).toFixed(2)}%"></span></span>
            <span class="columns__grade score--${grade}">${grade.toUpperCase()}</span>
        </a>`;
    })}`);
    return rated;
}

export function renderFigures(root, stats) {
    const lang = currentLang();
    const set = (name, value) => { const el = root.querySelector(`[data-fig-${name}]`); if (el) el.textContent = value; };
    set('total', formatNumber(stats.total, lang));
    statusChart(root.querySelector('[data-fig-status]'), stats, lang);
    const nutri = root.querySelector('[data-fig-nutri]');
    if (nutri && stats.nutriscore) {
        set('ns-rated', formatNumber(nutriscoreChart(nutri, stats, lang), lang));
        set('ns-none', formatNumber(stats.nutriscore_none, lang));
    }
    set('contributors', formatNumber(stats.contributors, lang));
    set('countries', formatNumber(stats.countries, lang));
    root.setAttribute('aria-busy', 'false');
    bindTooltips(root);
}
