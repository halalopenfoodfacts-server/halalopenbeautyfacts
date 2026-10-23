// Pages statiques traduites (/en/, /ar/, /es/) générées au build à partir des catalogues
// core/i18n/<lang>.json : les moteurs de recherche voient chaque langue sans exécuter de JavaScript.
// Les contenus ajoutés ensuite par les scripts sont traduits dans le navigateur (translate-page.js).
import { createCatalog, localizedPath, normalizeText, PATH_LANGS } from '../js/lib/i18n-catalog.js';

export { localizedPath };
export const PAGE_LANGS = PATH_LANGS;
const RTL = new Set(['ar']);
const OG_LOCALE = { fr: 'fr_FR', en: 'en_GB', ar: 'ar_AR', es: 'es_ES' };


const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };
const decode = (text) => text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m);
const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text) => escapeText(text).replace(/"/g, '&quot;');


function translateSegment(segment, catalog) {
    if (!normalizeText(segment)) return segment;
    const translated = catalog.translateText(decode(segment));
    return translated == null ? segment : escapeText(translated);
}

/**
 * Traduit une page HTML construite (en français). Les blocs <script>, <style>, <svg>, <code>
 * et <pre> sont laissés tels quels ; les attributs lus par l'utilisateur sont traduits.
 */
export function translateHtml(source, entries, lang, { path, domain }) {
    const catalog = createCatalog(entries);
    const parts = source.split(/(<(?:script|style|svg|code|pre)\b[\s\S]*?<\/(?:script|style|svg|code|pre)>)/gi);
    const out = parts.map((part, index) => {
        if (index % 2 === 1) return part;   // bloc protégé
        return part.split(/(<[^>]*>)/).map((piece) => {
            if (!piece.startsWith('<')) return translateSegment(piece, catalog);
            let tag = piece.replace(/\s(placeholder|aria-label|title|alt)="([^"]*)"/g, (match, name, value) => {
                const translated = catalog.translateText(decode(value));
                return translated == null ? match : ` ${name}="${escapeAttr(translated)}"`;
            });
            if (/^<meta\s/.test(tag) && /(name="description"|property="og:(title|description)")/.test(tag)) {
                tag = tag.replace(/\scontent="([^"]*)"/, (match, value) => {
                    const translated = catalog.translateText(decode(value));
                    return translated == null ? match : ` content="${escapeAttr(translated)}"`;
                });
            }
            // Liens internes vers la même langue
            return tag.replace(/(<a\b[^>]*\shref=")(\/[^"]*)"/g, (match, start, href) => `${start}${localizedPath(href, lang)}"`);
        }).join('');
    }).join('');

    const url = domain + localizedPath(path, lang);
    return out
        .replace(/<html lang="fr" dir="ltr"/, `<html lang="${lang}" dir="${RTL.has(lang) ? 'rtl' : 'ltr'}"`)
        .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
        .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`)
        .replace(/<meta property="og:locale" content="[^"]*">/, `<meta property="og:locale" content="${OG_LOCALE[lang]}">`);
}

/** Balises <link rel="alternate" hreflang> d'une page (à insérer dans chaque version). */
export function alternateLinks(path, domain, langs = ['fr', ...PAGE_LANGS]) {
    return [
        ...langs.map((lang) => `<link rel="alternate" hreflang="${lang}" href="${domain}${localizedPath(path, lang)}">`),
        `<link rel="alternate" hreflang="x-default" href="${domain}${path}">`,
    ].join('\n');
}
