// Serveur local (dev et tests E2E) : sert dist/ comme le nginx de production.
// - /proxy/*  → API Django (API_TARGET, défaut http://127.0.0.1:8000) avec l'en-tête X-Portal
// - en-têtes de sécurité (CSP, Permissions-Policy…) lus dans deploy/nginx/*.conf,
//   pour que les tests échouent si une page viole la politique de production
// - 404.html pour les chemins inconnus, cache long pour les fichiers versionnés
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4173);
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:8000';
const site = JSON.parse(readFileSync(join(ROOT, 'site/site.config.json'), 'utf8'));

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
    '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};

export function securityHeaders() {
    const dir = join(ROOT, 'deploy/nginx');
    const conf = readdirSync(dir).filter((f) => f.endsWith('.conf')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const headers = {};
    for (const match of conf.matchAll(/^\s*add_header\s+(Content-Security-Policy|Permissions-Policy|X-Frame-Options|X-Content-Type-Options|Referrer-Policy)\s+"([^"]+)"/gm)) {
        headers[match[1]] = match[2];
    }
    // En local (http://127.0.0.1) la mise à niveau https casserait le chargement des ressources
    if (headers['Content-Security-Policy']) {
        headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(/;\s*upgrade-insecure-requests/, '');
    }
    return headers;
}

const SECURITY = securityHeaders();

const PROXY_RULES = [
    ['/proxy/v2/', '/api/v2/'],
    ['/proxy/search/', '/api/search/'],
    ['/proxy/facets/', '/api/facets/'],
    ['/proxy/stats', `/api/stats?portal=${site.portal}`],
    ['/proxy/top', `/api/top?portal=${site.portal}`],
    ['/proxy/recent', `/api/recent?portal=${site.portal}`],
];

async function proxy(req, res, url) {
    const rule = PROXY_RULES.find(([prefix]) => url.pathname.startsWith(prefix));
    if (!rule) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not found"}'); return; }
    const [prefix, target] = rule;
    let path = target + url.pathname.slice(prefix.length);
    if (url.search) path += (path.includes('?') ? '&' : '?') + url.search.slice(1);
    try {
        const upstream = await fetch(API_TARGET + path, { headers: { 'X-Portal': site.portal, Accept: 'application/json' } });
        const body = Buffer.from(await upstream.arrayBuffer());
        const headers = { 'Content-Type': upstream.headers.get('content-type') || 'application/json' };
        if (upstream.headers.get('retry-after')) headers['Retry-After'] = upstream.headers.get('retry-after');
        res.writeHead(upstream.status, headers);
        res.end(body);
    } catch {
        res.writeHead(502, { 'Content-Type': 'text/html' });
        res.end('<html><body>502 Bad Gateway</body></html>');
    }
}

function serveFile(res, file, status = 200) {
    const ext = extname(file);
    const immutable = file.includes('/assets/js/') || file.includes('/assets/css/') || file.includes('/assets/fonts/') || file.includes('/assets/vendor/');
    res.writeHead(status, {
        'Content-Type': TYPES[ext] || 'application/octet-stream',
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        ...(ext === '.html' ? SECURITY : { 'X-Content-Type-Options': 'nosniff' }),
    });
    createReadStream(file).pipe(res);
}

export function createAppServer() {
    return createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname.startsWith('/proxy/')) return proxy(req, res, url);
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
        let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
        if (!file.startsWith(DIST)) { res.writeHead(400); return res.end(); }
        if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
        if (existsSync(file)) return serveFile(res, file);
        return serveFile(res, join(DIST, '404.html'), 404);
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    createAppServer().listen(PORT, '127.0.0.1', () => {
        console.log(`▶ ${site.name} : http://127.0.0.1:${PORT}  (API → ${API_TARGET})`);
    });
}
