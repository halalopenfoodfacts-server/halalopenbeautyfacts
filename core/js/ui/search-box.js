// Recherche instantanée (combobox ARIA 1.2) : suggestions au fil de la frappe,
// navigation clavier, annulation des requêtes obsolètes, code-barres → fiche directe.
import { api } from '../lib/api.js';
import { looksLikeBarcode, normalizeBarcode } from '../lib/barcode.js';
import { html, raw, safeUrl } from '../lib/html.js';
import { statusOf } from '../lib/halal.js';
import { debounce } from './dom.js';
import { t } from './i18n-dom.js';
import { statusBadge } from './status.js';

let instances = 0;

export function catalogueUrl(query) {
    return `/catalogue.html?q=${encodeURIComponent(query)}`;
}

export function productUrl(code) {
    return `/product.html?code=${encodeURIComponent(code)}`;
}

export function initSearchBox(form, { onSubmit } = {}) {
    const input = form.querySelector('input[type="search"]');
    const clear = form.querySelector('[data-search-clear]');
    if (!input) return null;
    const id = `search-${(instances += 1)}`;
    const panel = document.createElement('div');
    panel.className = 'search__panel';
    panel.id = `${id}-panel`;
    panel.hidden = true;
    form.querySelector('.search')?.append(panel) ?? form.append(panel);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', panel.id);
    input.setAttribute('autocomplete', 'off');

    let controller = null;
    let options = [];
    let active = -1;
    let lastQuery = '';

    const close = () => {
        panel.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        active = -1;
    };
    const open = () => {
        panel.hidden = false;
        input.setAttribute('aria-expanded', 'true');
    };
    const setActive = (index) => {
        options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
        active = index;
        if (options[index]) {
            input.setAttribute('aria-activedescendant', options[index].id);
            options[index].scrollIntoView({ block: 'nearest' });
        } else {
            input.removeAttribute('aria-activedescendant');
        }
    };
    const footer = (query) => html`<div class="search__footer"><span>${t('search.label')}</span><a href="${catalogueUrl(query)}">${t('search.seeAll')} →</a></div>`;

    const render = (query, products) => {
        if (looksLikeBarcode(query) && !products.length) {
            panel.innerHTML = String(html`<ul class="search__list" role="listbox" aria-label="${t('search.label')}">
                <li role="option" id="${id}-opt-0" class="search__option" data-href="${productUrl(normalizeBarcode(query))}">
                    <span class="thumb placeholder-img">${raw('<svg aria-hidden="true"><use href="#i-scan"/></svg>')}</span>
                    <span><strong>${t('search.openBarcode')}</strong><small class="mono">${normalizeBarcode(query)}</small></span>
                </li></ul>`);
        } else if (!products.length) {
            panel.innerHTML = String(html`<p class="search__message" role="status">${t('search.noResult')}</p>${footer(query)}`);
        } else {
            panel.innerHTML = String(html`<ul class="search__list" role="listbox" aria-label="${t('search.label')}">${products.map((product, index) => {
                const img = safeUrl(product.image_front_small_url);
                return html`<li role="option" id="${id}-opt-${index}" class="search__option" aria-selected="false" data-href="${productUrl(product.code)}">
                    ${img ? html`<img src="${img}" alt="" width="44" height="44" loading="lazy">` : raw('<span class="thumb placeholder-img"><svg aria-hidden="true"><use href="#i-package"/></svg></span>')}
                    <span><strong>${product.product_name || product.code}</strong><small>${product.brands || ''}</small></span>
                    ${statusBadge(statusOf(product))}
                </li>`;
            })}</ul>${footer(query)}`);
        }
        options = [...panel.querySelectorAll('[role="option"]')];
        options.forEach((option, index) => {
            option.addEventListener('mousedown', (event) => event.preventDefault());
            option.addEventListener('click', () => { window.location.href = option.dataset.href; });
            option.addEventListener('mousemove', () => setActive(index));
        });
        panel.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true }));
        active = -1;
        open();
    };

    const suggest = debounce(async () => {
        const query = input.value.trim();
        if (query === lastQuery) return;
        lastQuery = query;
        controller?.abort();
        if (query.length < 2) { close(); return; }
        controller = new AbortController();
        try {
            const data = await api.search({ q: query, prefix: '1', page_size: 6, fields: 'product_name,brands' }, { signal: controller.signal, retry: 0 });
            if (input.value.trim() !== query) return;
            render(query, data.products || []);
        } catch (error) {
            if (error.kind === 'aborted') return;
            panel.innerHTML = String(html`<p class="search__message" role="status">${t('error.server')}</p>`);
            open();
        }
    }, 220);

    input.addEventListener('input', () => {
        if (clear) clear.hidden = !input.value;
        suggest();
    });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' && options.length) { event.preventDefault(); if (panel.hidden) open(); setActive((active + 1) % options.length); }
        else if (event.key === 'ArrowUp' && options.length) { event.preventDefault(); setActive(active <= 0 ? options.length - 1 : active - 1); }
        else if (event.key === 'Escape') { if (!panel.hidden) { event.preventDefault(); close(); } else { input.value = ''; } }
        else if (event.key === 'Enter' && active >= 0 && options[active]) { event.preventDefault(); window.location.href = options[active].dataset.href; }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('focus', () => { if (options.length && input.value.trim().length >= 2) open(); });
    clear?.addEventListener('click', () => { input.value = ''; clear.hidden = true; lastQuery = ''; close(); input.focus(); });
    if (clear) clear.hidden = !input.value;

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const query = input.value.trim();
        close();
        if (!query) { input.focus(); return; }
        if (onSubmit) { onSubmit(query); return; }
        window.location.href = looksLikeBarcode(query) ? productUrl(normalizeBarcode(query)) : catalogueUrl(query);
    });
    return { input, close };
}
