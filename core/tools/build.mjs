// Build de production : pages HTML (gabarits), CSS/JS minifiés et versionnés (hash),
// manifest PWA, service worker, sitemap, robots.txt. Sortie : dist/
//
//   node core/tools/build.mjs           build complet
//   node core/tools/build.mjs --watch   reconstruit à chaque modification (dev)
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { alternateLinks, localizedPath, PAGE_LANGS, translateHtml } from './i18n-pages.mjs';
import { render, splitFrontMatter } from './template.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CORE = join(ROOT, 'core');
const SITE = join(ROOT, 'site');
const DIST = join(ROOT, 'dist');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const hash = (content) => createHash('sha256').update(content).digest('hex').slice(0, 10);

function listFiles(dir, ext) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((name) => name.endsWith(ext)).map((name) => join(dir, name));
}

function walk(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
    });
}

function loadPartials() {
    const partials = {};
    for (const dir of [join(CORE, 'templates/partials'), join(SITE, 'partials')]) {
        for (const file of listFiles(dir, '.html')) partials[basename(file, '.html')] = readFileSync(file, 'utf8');
    }
    return partials;
}

function loadPages() {
    const pages = new Map();
    for (const dir of [join(CORE, 'pages'), join(SITE, 'pages')]) {
        for (const file of listFiles(dir, '.html')) pages.set(basename(file), file);   // le site surcharge le cœur
    }
    return pages;
}

/**
 * Lecture de texte sur photo (Tesseract.js) : moteur WebAssembly et modèles de langue
 * (variantes compactes « best_int ») servis depuis le site — la CSP n'autorise que 'self'.
 * Rien n'est téléchargé tant que l'utilisateur n'ouvre pas « Vérifier les ingrédients en photo ».
 */
function copyOcr() {
    const modules = join(ROOT, 'node_modules');
    const version = readJson(join(modules, 'tesseract.js/package.json')).version;
    const base = `/assets/ocr/${version}`;
    const out = join(DIST, base);
    mkdirSync(join(out, 'lang'), { recursive: true });
    for (const file of ['tesseract.esm.min.js', 'worker.min.js']) copyFileSync(join(modules, 'tesseract.js/dist', file), join(out, file));
    for (const file of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) copyFileSync(join(modules, 'tesseract.js-core', file), join(out, file));
    for (const lang of ['fra', 'eng', 'ara']) {
        copyFileSync(join(modules, `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`), join(out, `lang/${lang}.traineddata.gz`));
    }
    return base;
}

async function buildAssets(site, publicConfig) {
    const vendorSource = join(ROOT, 'node_modules/@zxing/library/umd/index.min.js');
    const vendorCode = readFileSync(vendorSource);
    const zxingUrl = `/assets/vendor/zxing-${hash(vendorCode)}.js`;
    mkdirSync(join(DIST, 'assets/vendor'), { recursive: true });
    writeFileSync(join(DIST, zxingUrl), vendorCode);

    const ocrBase = copyOcr();

    const entryPoints = Object.fromEntries(
        listFiles(join(CORE, 'js/pages'), '.js').map((file) => [basename(file, '.js'), file]),
    );
    const js = await esbuild.build({
        entryPoints,
        bundle: true,
        splitting: true,
        format: 'esm',
        minify: true,
        sourcemap: false,
        target: ['es2020', 'safari14'],
        outdir: join(DIST, 'assets/js'),
        entryNames: '[name]-[hash]',
        chunkNames: 'chunks/[name]-[hash]',
        metafile: true,
        legalComments: 'none',
        define: {
            __SITE__: JSON.stringify(publicConfig),
            __ZXING_URL__: JSON.stringify(zxingUrl),
            __OCR_BASE__: JSON.stringify(ocrBase),
        },
        logLevel: 'warning',
    });

    const css = await esbuild.build({
        entryPoints: { main: join(CORE, 'css/main.css') },
        bundle: true,
        minify: true,
        outdir: join(DIST, 'assets/css'),
        entryNames: '[name]-[hash]',
        assetNames: '../fonts/[name]-[hash]',
        loader: { '.woff2': 'file', '.svg': 'file' },
        alias: { '@site': SITE },
        metafile: true,
        logLevel: 'warning',
    });

    const scripts = {};
    for (const [out, meta] of Object.entries(js.metafile.outputs)) {
        if (meta.entryPoint) scripts[basename(meta.entryPoint, '.js')] = '/' + relative(DIST, out);
    }
    const cssFile = Object.keys(css.metafile.outputs).find((out) => out.endsWith('.css'));
    const fonts = Object.keys(css.metafile.outputs).filter((out) => out.endsWith('.woff2')).map((out) => '/' + relative(DIST, out));
    const allJs = Object.keys(js.metafile.outputs).map((out) => '/' + relative(DIST, out));
    // Préchargement : uniquement les sous-ensembles latins des polices de texte (les autres à la demande)
    const preloadFonts = fonts.filter((font) => /\/(fraunces|plex-sans)-latin-[\w]+\.woff2$/.test(font));
    return { scripts, css: '/' + relative(DIST, cssFile), fonts, preloadFonts, allJs, zxingUrl };
}

function buildManifest(site) {
    return {
        name: site.name,
        short_name: site.short,
        description: site.description,
        lang: 'fr',
        dir: 'ltr',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        theme_color: site.themeColor,
        background_color: site.backgroundColor,
        categories: site.manifestCategories,
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
            { name: 'Scanner un produit', short_name: 'Scanner', url: '/?scan=1', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Catalogue', url: '/catalogue.html', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Mes listes', url: '/my-lists.html', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
    };
}

/** Catalogues de traduction core/i18n/<lang>.json → /assets/i18n/<lang>-<hash>.json (entrées traduites seulement). */
function buildCatalogs() {
    const urls = {};
    const entries = {};
    mkdirSync(join(DIST, 'assets/i18n'), { recursive: true });
    for (const file of listFiles(join(CORE, 'i18n'), '.json').filter((f) => basename(f) !== 'backend.json')) {
        const lang = basename(file, '.json');
        entries[lang] = Object.fromEntries(Object.entries(readJson(file)).filter(([, value]) => value != null && value !== ''));
        const content = JSON.stringify(entries[lang]);
        const url = `/assets/i18n/${lang}-${hash(content)}.json`;
        writeFileSync(join(DIST, url), content);
        urls[lang] = url;
    }
    return { urls, entries };
}

function buildServiceWorker(version, precache) {
    const template = readFileSync(join(CORE, 'templates/service-worker.js'), 'utf8');
    return template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache, null, 2));
}

/** Les scripts inline doivent être autorisés par empreinte dans la CSP nginx (pas de 'unsafe-inline'). */
function verifyCspHashes(html) {
    const conf = listFiles(join(ROOT, 'deploy/nginx'), '.conf').map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        const digest = `'sha256-${createHash('sha256').update(code).digest('base64')}'`;
        if (!conf.includes(digest)) {
            throw new Error(`script inline non autorisé par la CSP : ajoutez ${digest} à script-src dans deploy/nginx/*.conf`);
        }
    }
}

export async function build({ quiet = false } = {}) {
    const started = Date.now();
    const site = readJson(join(SITE, 'site.config.json'));
    rmSync(DIST, { recursive: true, force: true });
    mkdirSync(DIST, { recursive: true });

    const publicConfig = {
        portal: site.portal,
        name: site.name,
        short: site.short,
        domain: site.domain,
        upstream: site.upstream,
        contact: site.contact,
        features: site.features,
        sensitiveIngredients: site.sensitiveIngredients,
    };
    const assets = await buildAssets(site, publicConfig);
    const catalogs = buildCatalogs();
    assets.i18nUrls = JSON.stringify(catalogs.urls);
    const pageLangs = PAGE_LANGS.filter((lang) => catalogs.entries[lang]);
    for (const lang of pageLangs) mkdirSync(join(DIST, lang), { recursive: true });

    // Fichiers statiques du site (images, icônes)
    cpSync(join(SITE, 'images'), join(DIST, 'assets/images'), { recursive: true });
    cpSync(join(SITE, 'icons'), join(DIST, 'icons'), { recursive: true });
    copyFileSync(join(SITE, 'icons/favicon-32.png'), join(DIST, 'favicon.png'));

    const content = Object.fromEntries(
        listFiles(join(SITE, 'content'), '.json').map((file) => [basename(file, '.json'), readJson(file)]),
    );
    // Contenus embarqués en <script type="application/json"> (non exécutés : compatibles CSP)
    const json = Object.fromEntries(Object.entries(content).map(([name, value]) => [name, JSON.stringify(value).replace(/</g, '\\u003c')]));
    const partials = loadPartials();
    const layout = readFileSync(join(CORE, 'templates/layout.html'), 'utf8');
    const buildInfo = { year: new Date().getFullYear(), date: new Date().toISOString().slice(0, 10) };
    const sitemap = [];
    const pages = loadPages();

    for (const [name, file] of pages) {
        const { meta, body } = splitFrontMatter(readFileSync(file, 'utf8'));
        const path = name === 'index.html' ? '/' : `/${name}`;
        const page = {
            name: basename(name, '.html'),
            path,
            url: site.domain + path,
            ...meta,
            script: assets.scripts[meta.script || 'static'],
            title: meta.title ? render(meta.title, { site }) : site.name,
            description: render(meta.description || site.description, { site }),
        };
        if (meta.script && !assets.scripts[meta.script]) throw new Error(`${name} : script inconnu « ${meta.script} »`);
        const context = { site, content, json, page, build: buildInfo, assets, nav: { [meta.nav || page.name]: true } };
        const pageBody = render(body, context, partials);
        let html = render(layout, { ...context, body: pageBody }, partials);
        if (!meta.noindex) {
            html = html.replace(/(<link rel="canonical" href="[^"]*">)/, `$1\n${alternateLinks(path, site.domain, ['fr', ...pageLangs])}`);
            sitemap.push({ path, priority: meta.priority ?? 0.5 });
        }
        writeFileSync(join(DIST, name), html);
        // Versions traduites : /en/…, /ar/…, /es/…
        for (const lang of pageLangs) {
            writeFileSync(join(DIST, lang, name), translateHtml(html, catalogs.entries[lang], lang, { path, domain: site.domain }));
        }
    }

    verifyCspHashes(readFileSync(join(DIST, 'index.html'), 'utf8'));
    writeFileSync(join(DIST, 'manifest.webmanifest'), JSON.stringify(buildManifest(site), null, 2));
    writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /proxy/\n\nSitemap: ${site.domain}/sitemap.xml\n`);
    writeFileSync(join(DIST, 'sitemap.xml'), [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        ...sitemap.flatMap(({ path, priority }) => ['fr', ...pageLangs].map((lang) => [
            `  <url><loc>${site.domain}${localizedPath(path, lang)}</loc><lastmod>${buildInfo.date}</lastmod><priority>${priority}</priority>`,
            ...['fr', ...pageLangs].map((alt) => `    <xhtml:link rel="alternate" hreflang="${alt}" href="${site.domain}${localizedPath(path, alt)}"/>`),
            '  </url>',
        ].join('\n'))),
        '</urlset>', '',
    ].join('\n'));

    const precache = [
        '/offline.html', assets.css, ...assets.allJs,
        ...assets.fonts.filter((font) => !font.includes('-ext-') && !font.includes('-arabic-')), '/assets/images/logo.webp', '/icons/icon-192.png',
    ];
    const version = hash(JSON.stringify(precache) + JSON.stringify([...pages.keys()]));
    writeFileSync(join(DIST, 'service-worker.js'), buildServiceWorker(version, [...new Set(precache)]));

    const size = walk(DIST).reduce((total, file) => total + statSync(file).size, 0);
    if (!quiet) {
        console.log(`✔ ${site.name} : ${pages.size} pages, ${Object.keys(assets.scripts).length} scripts, `
            + `${(size / 1024).toFixed(0)} Ko → dist/ (${Date.now() - started} ms)`);
    }
    return { site, assets, pages: [...pages.keys()] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        await build();
    } catch (error) {
        console.error('✖ Build en échec :', error.message);
        process.exit(1);
    }
    if (process.argv.includes('--watch')) {
        let timer;
        const rebuild = () => {
            clearTimeout(timer);
            timer = setTimeout(() => build().catch((error) => console.error('✖', error.message)), 120);
        };
        for (const dir of [CORE, SITE]) watch(dir, { recursive: true }, rebuild);
        console.log('… surveillance de core/ et site/');
    }
}
