// Extrait les textes français des deux sites construits (dist/ de food et de beauty) et des scripts
// (core/js) pour les catalogues de traduction communs core/i18n/<lang>.json. Les clés absentes d'un catalogue sont ajoutées avec la valeur
// null (à traduire), les clés devenues inutiles sont listées.
//
//   npm run build (dans les deux dépôts) && node core/tools/i18n-extract.mjs   liste ce qui manque
//   node core/tools/i18n-extract.mjs --write                    ajoute les clés manquantes (null)
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText } from '../js/lib/i18n-catalog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DISTS = [join(ROOT, 'dist'), join(ROOT, '..', 'beauty', 'dist'), join(ROOT, '..', 'food', 'dist')]
    .filter((dir, index, all) => existsSync(dir) && all.findIndex((d) => resolve(d) === resolve(dir)) === index);
const LANGS = ['en', 'ar', 'es'];
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };
const decode = (text) => text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m);

const isText = (text) => /\p{L}{2,}/u.test(text) && !/^(https?:|\/|#|[\w-]+\.(html|json|webp|png|svg)$)/.test(text);

function files(dir, ext) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return files(full, ext);
        return full.endsWith(ext) ? [full] : [];
    });
}

/** Textes visibles d'une page HTML : nœuds texte + attributs lus par le traducteur. */
export function htmlStrings(html) {
    const out = new Set();
    // Données embarquées (quiz, vérificateur…) : leurs textes sont affichés par les scripts
    for (const match of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
        for (const value of jsonValues(JSON.parse(match[1]))) {
            for (const segment of value.split(/<[^>]*>/)) {
                const text = normalizeText(decode(segment));
                if (isText(text) && looksLikeProse(text)) out.add(text);
            }
        }
    }
    const cleaned = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<(script|style|svg|code|pre)\b[\s\S]*?<\/\1>/gi, ' ');
    // Descriptions de page (moteurs de recherche, aperçus de partage)
    for (const match of cleaned.matchAll(/<meta (?:name="description"|property="og:(?:title|description)") content="([^"]*)"/g)) {
        const text = normalizeText(decode(match[1]));
        if (isText(text)) out.add(text);
    }
    for (const match of cleaned.matchAll(/\s(placeholder|aria-label|title|alt)="([^"]*)"/g)) {
        const text = normalizeText(decode(match[2]));
        if (isText(text)) out.add(text);
    }
    for (const segment of cleaned.split(/<[^>]*>/)) {
        const text = normalizeText(decode(segment));
        if (isText(text)) out.add(text);
    }
    return out;
}

function jsonValues(value) {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(jsonValues);
    if (value && typeof value === 'object') return Object.values(value).flatMap(jsonValues);
    return [];
}

/** Littéraux de chaîne des scripts ; dans un gabarit `…${x}…`, l'expression devient {x}. */
export function jsStrings(source) {
    const out = new Set();
    const add = (raw) => {
        for (const segment of raw.split(/<[^>]*>/)) {
            const text = normalizeText(decode(segment));
            if (!isText(text) || !looksLikeProse(text)) continue;
            out.add(text);
        }
    };
    let i = 0;
    while (i < source.length) {
        const c = source[i];
        if (c === '/' && source[i + 1] === '/') { i = source.indexOf('\n', i); if (i < 0) break; continue; }
        if (c === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i) + 2; continue; }
        if (c === "'" || c === '"') {
            let j = i + 1; let value = '';
            while (j < source.length && source[j] !== c) { if (source[j] === '\\') { value += source[j + 1]; j += 2; } else value += source[j++]; }
            add(value); i = j + 1; continue;
        }
        if (c === '`') {
            let j = i + 1; let value = '';
            while (j < source.length && source[j] !== '`') {
                if (source[j] === '\\') { value += source[j + 1]; j += 2; continue; }
                if (source[j] === '$' && source[j + 1] === '{') {
                    let depth = 1; j += 2;
                    const start = j;
                    while (j < source.length && depth) {
                        if (source[j] === '{') depth++;
                        else if (source[j] === '}') depth--;
                        else if (source[j] === '`') { const end = source.indexOf('`', j + 1); j = end; }
                        j++;
                    }
                    // Les chaînes à l'intérieur de l'expression sont aussi des textes affichés
                    for (const inner of jsStrings(source.slice(start, j - 1))) out.add(inner);
                    value += '{x}';
                    continue;
                }
                value += source[j++];
            }
            add(value); i = j + 1; continue;
        }
        i++;
    }
    return out;
}

// Phrase ou libellé destiné à l'utilisateur (et non un sélecteur, un nom de champ, du CSS…)
function looksLikeProse(text) {
    if (/[{}]/.test(text.replace(/\{x\}/g, ''))) return false;
    if (/^[\w:.\-[\]='"#>]+$/.test(text) && !/^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(text)) return false;
    if (/[=;]|=>|\(\)|^\.|^#|\bvar\(|\bpx\b|\brem\b/.test(text)) return false;
    return /[À-ÿ]/.test(text) || /\p{L}{2,}\s+\p{L}{2,}/u.test(text) || /^[A-ZÀ-Ý][a-zà-ÿ]{2,}/.test(text);
}

export function collect() {
    const strings = new Set();
    for (const dist of DISTS) {
        // Pages françaises uniquement (à la racine) : /en/, /ar/, /es/ en sont les traductions
        const pages = readdirSync(dist).filter((name) => name.endsWith('.html')).map((name) => join(dist, name));
        for (const page of pages) for (const s of htmlStrings(readFileSync(page, 'utf8'))) strings.add(s);
    }
    for (const script of files(join(ROOT, 'core/js'), '.js')) {
        if (script.endsWith('i18n.js') || script.endsWith('i18n-catalog.js')) continue;
        for (const s of jsStrings(readFileSync(script, 'utf8'))) strings.add(s);
    }
    for (const s of readJson(join(ROOT, 'core/i18n/backend.json'), [])) strings.add(normalizeText(s));
    return [...strings].sort((a, b) => a.localeCompare(b, 'fr'));
}

function readJson(path, fallback) {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    if (!DISTS.length) { console.error('dist/ absent : lancez npm run build'); process.exit(1); }
    const strings = collect();
    const write = process.argv.includes('--write');
    for (const lang of LANGS) {
        const path = join(ROOT, 'core/i18n', `${lang}.json`);
        const catalog = readJson(path, {});
        const missing = strings.filter((s) => catalog[s] == null);
        const unused = Object.keys(catalog).filter((k) => !strings.includes(k));
        console.log(`${lang} : ${strings.length} textes, ${missing.length} à traduire, ${unused.length} inutilisés`);
        if (write) {
            const next = {};
            for (const s of strings) next[s] = catalog[s] ?? null;
            for (const k of unused) if (catalog[k] != null) next[k] = catalog[k];   // clés vides devenues inutiles : retirées
            writeFileSync(path, `${JSON.stringify(next, null, 1)}\n`);
        }
    }
}
