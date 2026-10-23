// Fiche produit. Chargement réseau et rendu sont séparés : une donnée inattendue ne doit
// jamais afficher « erreur de connexion » alors que l'API a répondu (cf. AUDIT B1/B5).
import { api } from '../lib/api.js';
import { barcodeSvg, isValidGtin } from '../lib/barcode.js';
import { cleanTag, formatDate, formatQuantity, tagList } from '../lib/format.js';
import { html, raw, safeUrl } from '../lib/html.js';
import { highlightRanges, STATUS_META, statusOf } from '../lib/halal.js';
import { SITE } from '../lib/site.js';
import { LISTS, lists } from '../lib/storage.js';
import { bindImageFallbacks, productImage } from '../ui/card.js';
import { $, $$, icon, setHtml } from '../ui/dom.js';
import { currentLang, t } from '../ui/i18n-dom.js';
import { initSearchBox } from '../ui/search-box.js';
import { initShell } from '../ui/shell.js';
import { renderError, renderState } from '../ui/state.js';
import { seal, statusBadge } from '../ui/status.js';
import { toast } from '../ui/toast.js';

initShell();
$$('[data-search-form]').forEach((form) => initSearchBox(form));

const root = $('[data-product]');
const code = (new URLSearchParams(window.location.search).get('code') || '').trim();

const REASON_ICON = { 'halal-label': 'i-halal', 'exclusion-label': 'i-haram', conflict: 'i-haram', ingredient: 'i-doubtful', missing: 'i-info' };
const NUTRIMENTS = [
    ['energy_100g', 'Énergie', 'kJ', 3700],
    ['fat_100g', 'Matières grasses', 'g', 100],
    ['saturated-fat_100g', 'dont acides gras saturés', 'g', 30],
    ['carbohydrates_100g', 'Glucides', 'g', 100],
    ['sugars_100g', 'dont sucres', 'g', 60],
    ['proteins_100g', 'Protéines', 'g', 60],
    ['salt_100g', 'Sel', 'g', 6],
];
const NUTRISCORE_TEXT = { a: 'Très bonne qualité nutritionnelle', b: 'Bonne qualité nutritionnelle', c: 'Qualité nutritionnelle moyenne', d: 'Qualité nutritionnelle faible', e: 'Qualité nutritionnelle mauvaise' };
const NOVA_TEXT = { 1: 'Aliments peu ou pas transformés', 2: 'Ingrédients culinaires transformés', 3: 'Aliments transformés', 4: 'Produits ultra-transformés' };

function breadcrumb(name) {
    return html`<nav class="breadcrumb" aria-label="Fil d'Ariane"><a href="/">Accueil</a><span aria-hidden="true">/</span><a href="/catalogue.html">Catalogue</a><span aria-hidden="true">/</span><span aria-current="page">${name}</span></nav>`;
}

function highlightIngredients(text) {
    const ranges = highlightRanges(text, SITE.sensitiveIngredients || []);
    if (!ranges.length) return html`${text}`;
    const parts = [];
    let last = 0;
    for (const [start, end] of ranges) {
        parts.push(html`${text.slice(last, start)}`, html`<mark class="flag">${text.slice(start, end)}</mark>`);
        last = end;
    }
    parts.push(html`${text.slice(last)}`);
    return html`${parts}`;
}

function tags(value, limit = 12) {
    const items = tagList(value).map(cleanTag).filter(Boolean).slice(0, limit);
    return items.length ? html`<span class="chip-row">${items.map((item) => html`<span class="tag">${item}</span>`)}</span>` : html`<span class="muted">—</span>`;
}

function kvRow(label, value) {
    if (value === '' || value == null) return '';
    return html`<dt>${label}</dt><dd>${value}</dd>`;
}

function verdictPanel(product) {
    const status = statusOf(product);
    const info = product.halal || {};
    const reasons = info.reasons || [];
    return html`<section class="verdict verdict--${status}" aria-labelledby="verdict-title">
        ${seal(status, { stamp: true })}
        <div>
            <h2 id="verdict-title">${t(`status.${status}`)}</h2>
            <p class="verdict__summary">${info.summary || STATUS_META[status].description}</p>
            ${reasons.length ? html`<ul class="reasons">${reasons.map((reason) => html`<li class="r-${reason.type}">${raw(icon(REASON_ICON[reason.type] || 'i-info'))}<span>${reason.text}</span></li>`)}</ul>` : ''}
            <p class="verdict__note">Informations issues des contributeurs ${SITE.upstream.name}, sans vérification par un organisme. En cas de doute, fiez-vous au logo de certification présent sur l'emballage.</p>
        </div>
    </section>`;
}

function nutritionPanel(product) {
    if (!SITE.features?.nutrition) return '';
    const n = product.nutriments || {};
    const grade = (product.nutriscore_grade || '').toLowerCase();
    const nova = product.nova_group;
    const rows = NUTRIMENTS.filter(([key]) => typeof n[key] === 'number');
    if (!rows.length && !/^[a-e]$/.test(grade) && !nova) return '';
    const lang = currentLang();
    return html`<section class="panel" aria-labelledby="nutrition-title">
        <h2 id="nutrition-title">${raw(icon('i-chart'))}${t('product.nutrition')}</h2>
        <div class="scores-row">
            ${/^[a-e]$/.test(grade) ? html`<div class="score-tile score-tile--${grade}"><small>Nutri-Score</small><strong>${grade.toUpperCase()}</strong><span>${NUTRISCORE_TEXT[grade]}</span></div>` : ''}
            ${nova ? html`<div class="score-tile"><small>NOVA</small><strong>${nova}</strong><span>${NOVA_TEXT[nova] || ''}</span></div>` : ''}
        </div>
        ${rows.length ? html`<div class="table-wrap"><table class="table nutrition-table">
            <caption class="sr-only">Valeurs nutritionnelles pour 100 g</caption>
            <thead><tr><th scope="col">Pour 100 g</th><th scope="col" style="text-align:right">Quantité</th></tr></thead>
            <tbody>${rows.map(([key, label, unit, max]) => html`<tr><th scope="row" style="font-weight:500">${label}
                <div class="bar" aria-hidden="true"><span style="width:${Math.min(100, (n[key] / max) * 100).toFixed(1)}%"></span></div></th>
                <td class="num">${key === 'energy_100g' ? `${formatQuantity(n[key], 'kJ', lang)} · ${formatQuantity(n[key] / 4.184, 'kcal', lang)}` : formatQuantity(n[key], unit, lang)}</td></tr>`)}</tbody>
        </table></div>` : ''}
    </section>`;
}

function renderProduct(product) {
    const name = product.product_name || 'Produit sans nom';
    const status = statusOf(product);
    const svg = isValidGtin(product.code) ? barcodeSvg(product.code) : '';
    const ingredients = product.ingredients_text_fr || product.ingredients_text || '';
    const editUrl = `${SITE.upstream.productUrl}${encodeURIComponent(product.code)}`;
    const quantity = product.quantity ? ` · ${product.quantity}` : '';

    setHtml(root, html`
        ${breadcrumb(name)}
        <div class="product-hero">
            <div class="product-hero__media">${productImage(product.image_front_url || product.image_front_small_url, name, { eager: true, width: 400, height: 400 })}</div>
            <div class="product-hero__info">
                ${statusBadge(status, { size: 'lg' })}
                <h1>${name}</h1>
                ${product.brands ? html`<p class="product-hero__brand">${product.brands}${quantity}</p>` : ''}
                <p class="product-hero__meta">
                    <span>Code-barres <span class="mono">${product.code}</span></span>
                    ${product.last_modified_t ? html`<span>Mis à jour le ${formatDate(product.last_modified_t, currentLang())}</span>` : ''}
                </p>
                ${svg ? html`<figure class="barcode-figure">${raw(svg)}<figcaption>${product.code}</figcaption></figure>` : ''}
                <div class="product-hero__actions" data-actions>
                    ${Object.entries(LISTS).map(([key, list]) => html`<button class="btn btn--sm" type="button" data-list="${key}" aria-pressed="${lists.has(key, product.code)}">${raw(icon(list.icon))}<span>${list.label}</span></button>`)}
                    <a class="btn btn--sm" href="/compare.html?add=${encodeURIComponent(product.code)}">${raw(icon('i-scale'))}<span>${t('product.compare')}</span></a>
                    <button class="btn btn--sm btn--ghost" type="button" data-share>${raw(icon('i-share'))}<span>${t('product.share')}</span></button>
                </div>
            </div>
        </div>

        <div class="product-sections">
            <div class="span-all">${verdictPanel(product)}</div>

            <section class="panel" aria-labelledby="ingredients-title">
                <h2 id="ingredients-title">${raw(icon('i-flask'))}${t('product.ingredients')}</h2>
                ${ingredients
                    ? html`<p class="ingredients-text">${highlightIngredients(ingredients)}</p>`
                    : html`<div class="callout callout--warn">${raw(icon('i-info'))}<span>La liste des ingrédients n'est pas renseignée. <a href="${editUrl}" target="_blank" rel="noopener">Ajoutez-la sur ${SITE.upstream.name}</a> pour fiabiliser le statut.</span></div>`}
                <dl class="kv" style="margin-top:var(--space-4)">
                    ${kvRow('Allergènes', tags(product.allergens_tags))}
                    ${kvRow('Traces', tags(product.traces_tags))}
                    ${kvRow('Additifs', tags(product.additives_tags, 20))}
                    ${product.ingredients_analysis_tags?.length ? kvRow('Analyse', tags(product.ingredients_analysis_tags)) : ''}
                </dl>
            </section>

            ${nutritionPanel(product)}

            <section class="panel" aria-labelledby="details-title">
                <h2 id="details-title">${raw(icon('i-info'))}${t('product.details')}</h2>
                <dl class="kv">
                    ${kvRow('Dénomination', product.generic_name)}
                    ${kvRow('Catégories', tags(product.categories_tags, 6))}
                    ${kvRow('Labels', tags(product.labels_tags))}
                    ${kvRow('Pays de vente', tags(product.countries_tags, 10))}
                    ${kvRow('Origine', product.origins)}
                    ${kvRow('Lieux de fabrication', product.manufacturing_places)}
                    ${kvRow('Emballage', product.packaging)}
                    ${kvRow('Magasins', product.stores)}
                    ${kvRow('Conservation', product.conservation_conditions_fr)}
                </dl>
            </section>

            <section class="span-all contribute-strip">
                <div>
                    <h2>Une information manque ou semble fausse ?</h2>
                    <p>Les fiches sont modifiables par tous sur ${SITE.upstream.name}. Vos corrections apparaîtront ici lors de la prochaine synchronisation.</p>
                </div>
                <a class="btn btn--lg" href="${editUrl}" target="_blank" rel="noopener">${raw(icon('i-edit'))}<span>Compléter la fiche</span>${raw(icon('i-external'))}</a>
            </section>
        </div>`);
    bindImageFallbacks(root);
}

function bindActions(product) {
    $$('[data-list]', root).forEach((button) => button.addEventListener('click', () => {
        const key = button.dataset.list;
        const added = lists.toggle(key, product);
        button.setAttribute('aria-pressed', String(added));
        toast(t(added ? 'list.added' : 'list.removed', { list: LISTS[key].label }), { type: added ? 'success' : 'info', action: added ? { label: t('nav.lists'), href: '/my-lists.html' } : null });
    }));
    $('[data-share]', root)?.addEventListener('click', async () => {
        const data = { title: product.product_name || SITE.name, text: `${product.product_name || ''} — ${t(`status.${statusOf(product)}`)}`, url: window.location.href };
        try {
            if (navigator.share) await navigator.share(data);
            else { await navigator.clipboard.writeText(data.url); toast(t('product.linkCopied'), { type: 'success' }); }
        } catch { /* partage annulé */ }
    });
}

function updateMeta(product) {
    const name = product.product_name || product.code;
    const status = t(`status.${statusOf(product)}`);
    document.title = `${name}${product.brands ? ` — ${product.brands}` : ''} · ${status} | ${SITE.name}`;
    const description = `${name} : ${status.toLowerCase()}. Ingrédients, additifs${SITE.features?.nutrition ? ', Nutri-Score' : ''} et informations halal.`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `${SITE.domain}/product.html?code=${encodeURIComponent(product.code)}`);
    const image = safeUrl(product.image_front_url);
    const ld = { '@context': 'https://schema.org', '@type': 'Product', name, gtin: product.code, brand: product.brands ? { '@type': 'Brand', name: product.brands } : undefined, image: image || undefined };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(ld);
    document.head.append(script);
}

function renderNotFound() {
    document.title = `${t('product.notFound')} | ${SITE.name}`;
    renderState(root, {
        title: t('product.notFound'),
        message: `Le code ${code} n'est pas encore dans notre base. Vous pouvez l'ajouter sur ${SITE.upstream.name} : il apparaîtra ici après la prochaine synchronisation.`,
        icon: 'i-package',
        actions: [
            ...(SITE.upstream.addUrl ? [{ label: t('scan.add'), href: `${SITE.upstream.addUrl}${encodeURIComponent(code)}`, primary: true }] : []),
            { label: t('nav.catalogue'), href: '/catalogue.html' },
        ],
    });
    root.querySelector('a[href^="http"]')?.setAttribute('target', '_blank');
}

async function load() {
    root.setAttribute('aria-busy', 'true');
    if (!/^[0-9A-Za-z_-]{1,64}$/.test(code)) {
        renderState(root, { title: 'Aucun produit sélectionné', message: 'Le lien ne contient pas de code-barres valide.', actions: [{ label: t('nav.catalogue'), href: '/catalogue.html', primary: true }] });
        root.setAttribute('aria-busy', 'false');
        return;
    }

    // 1. Réseau
    let product;
    try {
        ({ product } = await api.product(code));
    } catch (error) {
        root.setAttribute('aria-busy', 'false');
        if (error.kind === 'not-found' || error.kind === 'bad-request') renderNotFound();
        else renderError(root, error, load);
        return;
    }

    // 2. Rendu (une erreur ici est un défaut de l'interface, pas du réseau)
    try {
        renderProduct(product);
        bindActions(product);
        updateMeta(product);
        lists.remember(product);
    } catch (error) {
        console.error('[product] rendu impossible', error);
        renderState(root, { kind: 'error', title: 'Affichage impossible', message: 'Les données ont bien été reçues mais la fiche n\'a pas pu être affichée. Vous pouvez la consulter sur la source.', actions: [{ label: `Voir sur ${SITE.upstream.name}`, href: `${SITE.upstream.productUrl}${encodeURIComponent(code)}` }] });
    } finally {
        root.setAttribute('aria-busy', 'false');
    }
}

load();
