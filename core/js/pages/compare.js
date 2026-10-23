import { api } from '../lib/api.js';
import { looksLikeBarcode, normalizeBarcode } from '../lib/barcode.js';
import { cleanTag, formatQuantity, tagList } from '../lib/format.js';
import { html, raw } from '../lib/html.js';
import { statusOf } from '../lib/halal.js';
import { SITE } from '../lib/site.js';
import { lists } from '../lib/storage.js';
import { bindImageFallbacks, productImage } from '../ui/card.js';
import { $, icon, setHtml } from '../ui/dom.js';
import { currentLang, t } from '../ui/i18n-dom.js';
import { initShell } from '../ui/shell.js';
import { renderError, renderState } from '../ui/state.js';
import { statusBadge } from '../ui/status.js';
import { toast } from '../ui/toast.js';

initShell();

const MAX = 3;
const slots = $('[data-compare-slots]');
const table = $('[data-compare-table]');
const resultsBox = $('[data-compare-results]');
const searchForm = $('[data-compare-search]');
const cache = new Map();
let codes = lists.compare();

const params = new URLSearchParams(window.location.search);
if (params.get('add')) {
    const code = params.get('add');
    if (!codes.includes(code)) codes = [...codes, code].slice(-MAX);
    lists.setCompare(codes);
    window.history.replaceState({}, '', '/compare.html');
}

const hasIngredients = (p) => Boolean((p.ingredients_text_fr || p.ingredients_text || '').trim());
const STATUS_RANK = { halal: 0, unknown: 1, doubtful: 2, haram: 3 };
const ROWS = [
    ['Statut halal', (p) => statusBadge(statusOf(p)), (p) => STATUS_RANK[statusOf(p)]],
    ['Marque', (p) => p.brands || '—'],
    // Sans liste d'ingrédients, « aucun » serait trompeur : la case reste non renseignée et n'est pas classée
    ['Ingrédients sensibles', (p) => (!hasIngredients(p) ? 'Ingrédients non renseignés' : p.halal?.ingredient_signals?.length ? p.halal.ingredient_signals.join(', ') : 'Aucun détecté'), (p) => (hasIngredients(p) ? p.halal?.ingredient_signals?.length ?? 0 : null)],
    ['Additifs', (p) => (tagList(p.additives_tags).length ? tagList(p.additives_tags).map(cleanTag).join(', ') : hasIngredients(p) ? 'Aucun' : '—'), (p) => (hasIngredients(p) ? tagList(p.additives_tags).length : null)],
    ['Allergènes', (p) => (tagList(p.allergens_tags).length ? tagList(p.allergens_tags).map(cleanTag).join(', ') : '—')],
];
if (SITE.features?.nutrition) {
    ROWS.push(
        ['Nutri-Score', (p) => (p.nutriscore_grade ? html`<span class="score score--${p.nutriscore_grade}">${p.nutriscore_grade.toUpperCase()}</span>` : '—'), (p) => (p.nutriscore_grade ? 'abcde'.indexOf(p.nutriscore_grade) : null)],
        ['NOVA', (p) => p.nova_group || '—', (p) => p.nova_group ?? null],
        ['Énergie (100 g)', (p) => formatQuantity(p.nutriments?.energy_100g / 4.184, 'kcal', currentLang()), (p) => p.nutriments?.energy_100g ?? null],
        ['Sucres (100 g)', (p) => formatQuantity(p.nutriments?.sugars_100g, 'g', currentLang()), (p) => p.nutriments?.sugars_100g ?? null],
        ['Sel (100 g)', (p) => formatQuantity(p.nutriments?.salt_100g, 'g', currentLang()), (p) => p.nutriments?.salt_100g ?? null],
        ['Graisses saturées', (p) => formatQuantity(p.nutriments?.['saturated-fat_100g'], 'g', currentLang()), (p) => p.nutriments?.['saturated-fat_100g'] ?? null],
    );
}

async function fetchProduct(code) {
    if (!cache.has(code)) cache.set(code, api.product(code).then((data) => data.product));
    try { return await cache.get(code); } catch (error) { cache.delete(code); throw error; }
}

function save() { lists.setCompare(codes); }

function remove(code) {
    codes = codes.filter((c) => c !== code);
    save();
    render();
}

async function render() {
    const settled = await Promise.allSettled(codes.map(fetchProduct));
    const products = [];
    setHtml(slots, html`${[0, 1, 2].map((index) => {
        const code = codes[index];
        if (!code) return html`<div class="compare-slot compare-slot--empty">${raw(icon('i-plus', 'icon'))}<span>Emplacement libre</span></div>`;
        const result = settled[index];
        if (result.status === 'rejected') {
            return html`<div class="compare-slot"><button class="btn btn--ghost btn--icon btn--sm remove" type="button" data-remove="${code}" aria-label="Retirer">${raw(icon('i-x'))}</button><strong class="mono">${code}</strong><span class="muted">${result.reason?.kind === 'not-found' ? 'Produit introuvable' : 'Chargement impossible'}</span></div>`;
        }
        const p = result.value;
        products.push(p);
        return html`<div class="compare-slot">
            <button class="btn btn--ghost btn--icon btn--sm remove" type="button" data-remove="${code}" aria-label="Retirer ${p.product_name || code}">${raw(icon('i-x'))}</button>
            ${productImage(p.image_front_small_url, p.product_name || code, { width: 96, height: 96 })}
            <div><strong><a href="/product.html?code=${encodeURIComponent(p.code)}">${p.product_name || p.code}</a></strong><br>${statusBadge(statusOf(p))}</div>
        </div>`;
    })}`);
    bindImageFallbacks(slots);
    slots.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => remove(button.dataset.remove)));

    if (products.length < 2) {
        renderState(table, { title: products.length ? 'Ajoutez un deuxième produit' : 'Aucun produit à comparer', message: 'Recherchez un produit ci-dessus pour l\'ajouter à la comparaison.', icon: 'i-scale' });
        return;
    }
    setHtml(table, html`<div class="table-wrap"><table class="table compare-table">
        <caption class="sr-only">Comparaison de ${products.length} produits</caption>
        <thead><tr><th scope="col">Critère</th>${products.map((p) => html`<th scope="col">${p.product_name || p.code}</th>`)}</tr></thead>
        <tbody>${ROWS.map(([label, cell, score]) => {
            const values = score ? products.map(score) : [];
            const valid = values.filter((v) => typeof v === 'number');
            const best = valid.length > 1 && new Set(valid).size > 1 ? Math.min(...valid) : null;
            return html`<tr><th scope="row">${label}</th>${products.map((p, i) => html`<td class="${best !== null && values[i] === best ? 'is-best' : ''}">${cell(p)}</td>`)}</tr>`;
        })}</tbody>
    </table></div><p class="muted" style="margin-top:.75rem;font-size:var(--text-sm)">Sur fond vert : la meilleure valeur de la ligne.</p>`);
}

async function search(query) {
    resultsBox.innerHTML = `<p class="muted">${t('common.loading')}</p>`;
    try {
        const params = looksLikeBarcode(query) ? { q: normalizeBarcode(query), page_size: 6 } : { q: query, page_size: 6 };
        const { products = [] } = await api.search(params);
        if (!products.length) { renderState(resultsBox, { title: t('search.noResult'), message: t('results.emptyHint') }); return; }
        setHtml(resultsBox, html`<ul class="list-stack" style="list-style:none;padding:0">${products.map((p) => html`<li class="list-item">
            ${productImage(p.image_front_small_url, p.product_name || p.code, { width: 64, height: 64 })}
            <div><strong>${p.product_name || p.code}</strong><small>${p.brands || ''}</small></div>
            <button class="btn btn--soft btn--sm" type="button" data-add="${p.code}" ${codes.includes(p.code) ? 'disabled' : ''}>${raw(icon('i-plus'))}<span>Ajouter</span></button>
        </li>`)}</ul>`);
        bindImageFallbacks(resultsBox);
        resultsBox.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => {
            if (codes.length >= MAX) { toast('Trois produits maximum : retirez-en un d\'abord.', { type: 'error' }); return; }
            codes = [...codes, button.dataset.add];
            save();
            button.disabled = true;
            render();
            toast('Produit ajouté à la comparaison', { type: 'success' });
        }));
    } catch (error) {
        renderError(resultsBox, error, () => search(query));
    }
}

searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = searchForm.elements.q.value.trim();
    if (query) search(query);
});

render();
