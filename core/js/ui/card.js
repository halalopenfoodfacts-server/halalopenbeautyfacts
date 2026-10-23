import { html, raw, safeUrl } from '../lib/html.js';
import { statusOf } from '../lib/halal.js';
import { SITE } from '../lib/site.js';
import { statusBadge } from './status.js';

const PLACEHOLDER_ICON = SITE.portal === 'beauty' ? 'i-sparkle' : 'i-package';

export function placeholder(iconName = PLACEHOLDER_ICON) {
    return raw(`<span class="placeholder-img" aria-hidden="true"><svg><use href="#${iconName}"/></svg></span>`);
}

export function productImage(url, alt, { eager = false, width = 200, height = 200 } = {}) {
    const src = safeUrl(url);
    if (!src) return placeholder();
    return html`<img src="${src}" alt="${alt}" width="${width}" height="${height}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" data-fallback>`;
}

/** Remplace les images cassées par le visuel de remplacement (pas de onerror inline : CSP). */
export function bindImageFallbacks(root = document) {
    for (const img of root.querySelectorAll('img[data-fallback]')) {
        img.removeAttribute('data-fallback');
        const swap = () => { img.replaceWith(Object.assign(document.createElement('span'), { innerHTML: String(placeholder()) }).firstElementChild); };
        if (img.complete && img.naturalWidth === 0) swap();
        else img.addEventListener('error', swap, { once: true });
    }
}

function scores(product) {
    if (!SITE.features?.nutrition) return '';
    const grade = (product.nutriscore_grade || '').toLowerCase();
    const parts = [];
    if (/^[a-e]$/.test(grade)) parts.push(html`<span class="score score--${grade}" title="Nutri-Score ${grade.toUpperCase()}">NS ${grade.toUpperCase()}</span>`);
    if (product.nova_group) parts.push(html`<span class="score score--nova" title="NOVA ${product.nova_group}">NOVA ${product.nova_group}</span>`);
    return parts.length ? html`<span class="product-card__scores">${parts}</span>` : '';
}

export function productCard(product, index = 0) {
    const name = product.product_name || 'Produit sans nom';
    const brand = Array.isArray(product.brands) ? product.brands.join(', ') : (product.brands || '');
    const code = encodeURIComponent(product.code || '');
    return html`<a class="product-card" href="/product.html?code=${code}" style="--i:${index % 12}" data-code="${product.code}">
        <span class="product-card__media">
            ${productImage(product.image_front_small_url || product.image_front_url, name)}
            ${statusBadge(statusOf(product))}
        </span>
        <span class="product-card__body">
            <span class="product-card__name">${name}</span>
            ${brand ? html`<span class="product-card__brand">${brand}</span>` : ''}
            ${scores(product)}
        </span>
    </a>`;
}

export function skeletonCards(count = 12) {
    const card = '<div class="product-card product-card--skeleton" aria-hidden="true"><div class="product-card__media skeleton"></div><div class="product-card__body"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line skeleton-line--short"></div></div></div>';
    return raw(card.repeat(count));
}
