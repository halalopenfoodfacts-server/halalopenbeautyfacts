// Vérifie que le socle commun (core/, package.json, playwright.config.mjs) est identique
// dans les dépôts food et beauty. Usage : npm run check:shared [-- ../chemin/vers/l-autre-depot]
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const portal = JSON.parse(readFileSync(join(ROOT, 'site/site.config.json'), 'utf8')).portal;
const OTHER = resolve(process.argv[2] || join(ROOT, '..', portal === 'food' ? 'beauty' : 'food'));
const SHARED = ['core', 'package.json', 'package-lock.json', 'playwright.config.mjs'];

function files(base, path) {
    const full = join(base, path);
    if (!existsSync(full)) return [];
    if (!statSync(full).isDirectory()) return [path];
    return readdirSync(full).flatMap((name) => files(base, join(path, name)));
}
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

if (!existsSync(join(OTHER, 'site/site.config.json'))) {
    console.log(`(dépôt jumeau introuvable : ${OTHER}) — vérification ignorée`);
    process.exit(0);
}
const mine = new Set(SHARED.flatMap((p) => files(ROOT, p)));
const theirs = new Set(SHARED.flatMap((p) => files(OTHER, p)));
const problems = [];
for (const file of new Set([...mine, ...theirs])) {
    if (!mine.has(file)) problems.push(`absent ici : ${file}`);
    else if (!theirs.has(file)) problems.push(`absent dans ${basename(OTHER)} : ${file}`);
    else if (digest(join(ROOT, file)) !== digest(join(OTHER, file))) problems.push(`différent : ${file}`);
}
if (problems.length) {
    console.error(`✖ socle commun divergent avec ${relative(process.cwd(), OTHER) || OTHER} :\n  ${problems.join('\n  ')}`);
    process.exit(1);
}
console.log(`✔ socle commun identique (${mine.size} fichiers) avec ${basename(OTHER)}`);
