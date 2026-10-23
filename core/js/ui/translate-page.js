// Traduction de toute la page (textes, attributs, contenus ajoutés ensuite par les scripts)
// à partir du catalogue site/i18n/<lang>.json, publié au build dans /assets/i18n/.
// Les textes absents du catalogue restent en français ; les données produits (noms,
// ingrédients) restent dans la langue de leur fiche.
import { createCatalog, langFromPath, localizedPath } from '../lib/i18n-catalog.js';

const ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt'];
const PATH_LANG = langFromPath(window.location.pathname);
const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'NOSCRIPT']);

function skipped(element) {
    return !element || SKIP.has(element.tagName) || element.closest('[translate="no"], svg');
}

function translateTextNode(node, catalog) {
    if (skipped(node.parentElement)) return;
    const next = catalog.translateText(node.nodeValue);
    if (next != null && next !== node.nodeValue) node.nodeValue = next;
}

function translateAttributes(element, catalog) {
    if (skipped(element)) return;
    if (PATH_LANG && element.tagName === 'A') {
        const href = element.getAttribute('href');
        if (href) {
            const next = localizedPath(href, PATH_LANG);
            if (next !== href) element.setAttribute('href', next);
        }
    }
    for (const name of ATTRIBUTES) {
        const value = element.getAttribute(name);
        if (!value) continue;
        const next = catalog.translateText(value);
        if (next != null && next !== value) element.setAttribute(name, next);
    }
}

function translateTree(root, catalog) {
    if (root.nodeType === Node.TEXT_NODE) return translateTextNode(root, catalog);
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    translateAttributes(root, catalog);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, catalog);
        else translateAttributes(node, catalog);
    }
}

function catalogUrl(lang) {
    try {
        return JSON.parse(document.querySelector('meta[name="hof-i18n"]')?.content || '{}')[lang];
    } catch {
        return undefined;
    }
}

const reveal = () => document.documentElement.classList.remove('i18n-pending');

export async function translatePage(lang) {
    const url = lang === 'fr' ? undefined : catalogUrl(lang);
    if (!url) return reveal();
    let catalog;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        catalog = createCatalog(await response.json());
    } catch {
        return reveal();   // catalogue indisponible : la page reste en français
    }
    translateTree(document.documentElement, catalog);
    reveal();
    new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') mutation.addedNodes.forEach((node) => translateTree(node, catalog));
            else if (mutation.type === 'characterData') translateTextNode(mutation.target, catalog);
            else translateAttributes(mutation.target, catalog);
        }
    }).observe(document.documentElement, {
        childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ATTRIBUTES,
    });
}
