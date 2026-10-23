import assert from 'node:assert/strict';
import { test } from 'node:test';
import { langFromPath, localizedPath, stripLang } from '../../js/lib/i18n-catalog.js';
import { alternateLinks, translateHtml } from '../../tools/i18n-pages.mjs';

test('adresses par langue : le français reste à la racine, les fichiers techniques ne sont pas préfixés', () => {
    assert.equal(localizedPath('/catalogue.html?pays=en:morocco', 'ar'), '/ar/catalogue.html?pays=en:morocco');
    assert.equal(localizedPath('/', 'en'), '/en/');
    assert.equal(localizedPath('/catalogue.html', 'fr'), '/catalogue.html');
    assert.equal(localizedPath('/assets/images/logo.webp', 'en'), '/assets/images/logo.webp');
    assert.equal(localizedPath('/p/3017620422003', 'es'), '/p/3017620422003');
    assert.equal(localizedPath('/en/learn.html', 'ar'), '/en/learn.html');
    assert.equal(localizedPath('https://example.org/', 'en'), 'https://example.org/');
    assert.equal(langFromPath('/ar/product.html'), 'ar');
    assert.equal(langFromPath('/english.html'), '');
    assert.equal(stripLang('/es/'), '/');
    assert.equal(stripLang('/es/learn.html'), '/learn.html');
});

test('page traduite au build : textes, attributs, langue, canonical, liens internes', () => {
    const source = '<html lang="fr" dir="ltr"><head><title>Accueil</title><link rel="canonical" href="https://x.org/learn.html">'
        + '<meta name="description" content="Apprendre le halal"><script>var a = "Accueil";</script></head>'
        + '<body><a href="/catalogue.html" title="Catalogue">Catalogue</a> <a href="/assets/a.pdf">Accueil</a><code>Accueil</code></body></html>';
    const out = translateHtml(source, { Accueil: 'Home', Catalogue: 'Catalogue', 'Apprendre le halal': 'Learn about halal' }, 'ar', { path: '/learn.html', domain: 'https://x.org' });
    assert.match(out, /<html lang="ar" dir="rtl"/);
    assert.match(out, /<title>Home<\/title>/);
    assert.match(out, /<link rel="canonical" href="https:\/\/x.org\/ar\/learn.html">/);
    assert.match(out, /content="Learn about halal"/);
    assert.match(out, /<a href="\/ar\/catalogue.html" title="Catalogue">/);
    assert.match(out, /<a href="\/assets\/a.pdf">Home<\/a>/);
    assert.match(out, /var a = "Accueil"/);          // scripts intacts
    assert.match(out, /<code>Accueil<\/code>/);       // code intact
});

test('liens hreflang de toutes les langues + x-default', () => {
    const links = alternateLinks('/', 'https://x.org');
    assert.match(links, /hreflang="fr" href="https:\/\/x.org\/"/);
    assert.match(links, /hreflang="ar" href="https:\/\/x.org\/ar\/"/);
    assert.match(links, /hreflang="x-default" href="https:\/\/x.org\/"/);
});
