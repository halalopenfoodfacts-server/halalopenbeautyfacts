// Catalogue de traduction « à la gettext » : le texte français affiché sert de clé.
// Utilisé par le traducteur de page (ui/translate-page.js) et l'extracteur (tools/i18n-extract.mjs).
// Une clé peut contenir {x} (partie variable : nombre, nom, code…), recopiée telle quelle
// ou traduite à son tour si elle figure elle-même dans le catalogue.

export const normalizeText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createCatalog(entries = {}) {
    const exact = new Map();
    const patterns = [];
    for (const [source, target] of Object.entries(entries)) {
        if (target == null || target === '') continue;
        if (source.includes('{x}')) {
            const parts = source.split('{x}').map(escape);
            patterns.push({ regex: new RegExp(`^${parts.join('(.+?)')}$`, 's'), target, fixed: source.replace(/\{x\}/g, '').length });
        } else {
            exact.set(source, target);
        }
    }
    // Le motif le plus précis (le plus de texte fixe) l'emporte
    patterns.sort((a, b) => b.fixed - a.fixed);

    function lookup(text) {
        const key = normalizeText(text);
        if (!key) return null;
        if (exact.has(key)) return exact.get(key);
        for (const { regex, target } of patterns) {
            const match = key.match(regex);
            if (!match) continue;
            let index = 0;
            const values = match.slice(1).map((value) => exact.get(value) ?? value);
            return target.replace(/\{x\}/g, () => values[index++] ?? '');
        }
        return null;
    }

    /** Traduit en conservant les espaces de début et de fin du texte d'origine. */
    function translateText(text) {
        const found = lookup(text);
        if (found == null) return null;
        const lead = /^\s*/.exec(text)[0];
        const trail = /\s*$/.exec(text)[0];
        return lead + found + trail;
    }

    return { lookup, translateText, size: exact.size + patterns.length };
}
