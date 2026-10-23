// Catalogue et page « Non conformes » : recherche, filtres, tri, pagination.
// L'état complet vit dans l'URL (partageable, bouton Retour fonctionnel).
import { api } from '../lib/api.js';
import { formatNumber } from '../lib/format.js';
import { html } from '../lib/html.js';
import { activeFilterCount, MAX_PAGE, PAGE_SIZE, parseState, serializeState, toApiParams } from '../lib/query.js';
import { bindImageFallbacks, productCard, skeletonCards } from '../ui/card.js';
import { $, $$, setHtml, trapFocus } from '../ui/dom.js';
import { currentLang, t } from '../ui/i18n-dom.js';
import { renderPagination } from '../ui/pagination.js';
import { renderError, renderState } from '../ui/state.js';
import { initShell } from '../ui/shell.js';

initShell();

const root = $('[data-catalogue]');
// Pages à statut imposé : « Non conformes » (haram), « Produits à compléter » (unknown)
const preset = ['haram', 'unknown'].includes(root.dataset.preset) ? { status: root.dataset.preset } : {};
const results = $('[data-results]', root);
const countLabel = $('[data-count]', root);
const pagination = $('[data-pagination]', root);
const form = $('[data-filters-form]', root);
const filters = $('[data-filters]', root);
const searchForm = $('[data-catalogue-search]', root);
const searchInput = $('input[type="search"]', searchForm);
const searchClear = $('[data-search-clear]', searchForm);
const sortSelect = $('[data-sort]', root);
const title = $('[data-catalogue-title]');
const defaultTitle = title?.textContent;

let state = parseState(window.location.search, preset);
let controller = null;
const labelText = new Map();

// ── Synchronisation état → contrôles ─────────────────────────
function syncControls() {
    searchInput.value = state.q;
    searchClear.hidden = !state.q;
    sortSelect.value = state.sort;
    sortSelect.disabled = Boolean(state.q);   // la recherche texte trie par pertinence
    const status = form.elements.status;
    if (status) [...form.querySelectorAll('input[name="status"]')].forEach((radio) => { radio.checked = radio.value === state.status; });
    form.elements.category.value = state.category;
    ensureOption(form.elements.country, state.country);
    form.elements.country.value = state.country;
    if (form.elements.palmFree) form.elements.palmFree.checked = state.palmFree;
    $$('[data-toggle]', form).forEach((chip) => {
        chip.setAttribute('aria-pressed', String(state[chip.dataset.toggle].includes(chip.dataset.value)));
    });
    const count = activeFilterCount(state) - (preset.status ? 1 : 0);
    $('[data-filter-count]', root).textContent = count ? ` (${count})` : '';
    if (title) title.textContent = state.q ? `Résultats pour « ${state.q} »` : defaultTitle;
    renderActiveFilters();
}

function ensureOption(select, value) {
    if (!value || [...select.options].some((option) => option.value === value)) return;
    select.add(new Option(value.replace(/^en:/, '').replace(/-/g, ' '), value));
}

function renderActiveFilters() {
    const container = $('[data-active-filters]', root);
    const chips = [];
    const add = (label, clear) => chips.push({ label, clear });
    if (state.q) add(`« ${state.q} »`, () => { state.q = ''; });
    if (state.status && !preset.status) add(t(`status.${state.status}`), () => { state.status = ''; });
    if (state.category) add(form.elements.category.selectedOptions[0]?.textContent || state.category, () => { state.category = ''; });
    if (state.country) add(form.elements.country.selectedOptions[0]?.textContent || state.country, () => { state.country = ''; });
    state.labels.forEach((label) => add(labelText.get(label) || label, () => { state.labels = state.labels.filter((l) => l !== label); }));
    state.nutriscore.forEach((grade) => add(`Nutri-Score ${grade.toUpperCase()}`, () => { state.nutriscore = state.nutriscore.filter((g) => g !== grade); }));
    state.nova.forEach((group) => add(`NOVA ${group}`, () => { state.nova = state.nova.filter((g) => g !== group); }));
    if (state.palmFree) add(t('filters.palm'), () => { state.palmFree = false; });
    container.innerHTML = '';
    chips.forEach(({ label, clear }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip';
        button.textContent = label;
        button.setAttribute('aria-label', `${label} — retirer`);
        button.addEventListener('click', () => { clear(); update(); });
        container.append(button);
    });
}

// ── Chargement ───────────────────────────────────────────────
async function load() {
    controller?.abort();
    controller = new AbortController();
    results.setAttribute('aria-busy', 'true');
    setHtml(results, skeletonCards(PAGE_SIZE / 2));
    countLabel.textContent = t('common.loading');
    pagination.innerHTML = '';
    try {
        const data = await api.search(toApiParams(state), { signal: controller.signal });
        render(data);
    } catch (error) {
        if (error.kind === 'aborted') return;
        countLabel.textContent = '';
        renderError(results, error, load);
    } finally {
        results.setAttribute('aria-busy', 'false');
    }
}

function render(data) {
    const products = data.products || [];
    const lang = currentLang();
    const exact = data.is_count_exact !== false;
    countLabel.innerHTML = String(html`<strong>${formatNumber(data.count, lang)}${exact ? '' : '+'}</strong> ${t(data.count === 1 ? 'results.one' : 'results.unit')}`);
    if (!products.length) {
        renderState(results, {
            title: t('results.empty'),
            message: t('results.emptyHint'),
            actions: activeFilterCount(state) - (preset.status ? 1 : 0) > 0 || state.q
                ? [{ label: t('common.reset'), onClick: reset, primary: true }]
                : [],
        });
        return;
    }
    setHtml(results, html`${products.map((product, index) => productCard(product, index))}`);
    bindImageFallbacks(results);
    const pageCount = Math.min(data.page_count || Math.ceil(data.count / PAGE_SIZE), MAX_PAGE);
    renderPagination(pagination, {
        page: state.page,
        pageCount,
        hrefFor: (page) => `?${serializeState({ ...state, page }, preset)}`,
        onNavigate: (page) => { state.page = page; update({ keepPage: true }); results.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    });
}

function update({ keepPage = false, replace = false } = {}) {
    if (!keepPage) state.page = 1;
    const query = serializeState(state, preset);
    const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
        window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
    }
    syncControls();
    load();
}

function reset() {
    state = { ...parseState('', preset) };
    update();
}

// ── Événements ───────────────────────────────────────────────
searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = searchInput.value.trim();
    update();
});
searchInput.addEventListener('input', () => { searchClear.hidden = !searchInput.value; });
searchClear.addEventListener('click', () => { searchInput.value = ''; state.q = ''; update(); searchInput.focus(); });
sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; update(); });
form.addEventListener('change', (event) => {
    const { name } = event.target;
    if (name === 'status') state.status = event.target.value;
    else if (name === 'category') state.category = event.target.value;
    else if (name === 'country') state.country = event.target.value;
    else if (name === 'palmFree') state.palmFree = event.target.checked;
    else return;
    update();
});
form.addEventListener('submit', (event) => event.preventDefault());
$$('[data-toggle]', form).forEach((chip) => {
    labelText.set(chip.dataset.value, chip.textContent.trim());
    chip.addEventListener('click', () => {
        const key = chip.dataset.toggle;
        const { value } = chip.dataset;
        state[key] = state[key].includes(value) ? state[key].filter((v) => v !== value) : [...state[key], value];
        update();
    });
});
$('[data-filters-reset]', form).addEventListener('click', reset);
window.addEventListener('popstate', () => {
    state = parseState(window.location.search, preset);
    syncControls();
    load();
});

// Panneau de filtres (mobile)
let releaseFocus = () => {};
let backdrop = null;
function openFilters() {
    filters.classList.add('is-open');
    backdrop = Object.assign(document.createElement('div'), { className: 'filters-backdrop' });
    backdrop.addEventListener('click', closeFilters);
    document.body.append(backdrop);
    document.body.style.overflow = 'hidden';
    releaseFocus = trapFocus(filters);
    $('[data-filters-close]', filters)?.focus();
}
function closeFilters() {
    if (!filters.classList.contains('is-open')) return;
    filters.classList.remove('is-open');
    backdrop?.remove();
    document.body.style.overflow = '';
    releaseFocus();
    $('[data-filters-open]', root)?.focus();
}
$('[data-filters-open]', root).addEventListener('click', openFilters);
$$('[data-filters-close]', filters).forEach((button) => button.addEventListener('click', closeFilters));
filters.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeFilters(); });

// Pays : liste enrichie avec les pays les plus représentés (facette précalculée)
api.facet('countries', { retry: 0 }).then(({ tags = [] }) => {
    const select = form.elements.country;
    const existing = new Set([...select.options].map((option) => option.value));
    tags.filter((tag) => tag.id?.startsWith('en:') && !existing.has(tag.id)).slice(0, 60)
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .forEach((tag) => select.add(new Option(tag.name, tag.id)));
    select.value = state.country;
}).catch(() => { /* liste réduite : sans gravité */ });

syncControls();
load();
