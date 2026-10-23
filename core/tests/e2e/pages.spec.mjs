import { expect, noHorizontalOverflow, test } from './helpers.mjs';

const PAGES = ['/', '/catalogue.html', '/excluded.html', '/compare.html', '/my-lists.html', '/dashboard.html',
    '/halal-users.html', '/learn.html', '/blog.html', '/add.html', '/signin.html', '/signup.html', '/api.html',
    '/legal.html', '/terms.html'];

for (const path of PAGES) {
    test(`${path} : se charge sans erreur, structure et métadonnées`, async ({ page }) => {
        const response = await page.goto(path, { waitUntil: 'networkidle' });
        expect(response.status()).toBe(200);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('main#contenu')).toBeVisible();
        expect((await page.title()).length).toBeGreaterThan(10);
        expect(await page.locator('meta[name="description"]').getAttribute('content')).toBeTruthy();
        // Toutes les images ont un texte alternatif (éventuellement vide si décoratives)
        expect(await page.locator('img:not([alt])').count()).toBe(0);
        // Tous les boutons ont un nom accessible
        const unnamed = await page.$$eval('button', (buttons) => buttons.filter((b) => b.offsetParent && !(b.textContent.trim() || b.getAttribute('aria-label'))).length);
        expect(unnamed).toBe(0);
        await noHorizontalOverflow(page);
    });
}

test('URL inconnue : vraie 404 avec page dédiée (avant : accueil en 200)', async ({ page }) => {
    const response = await page.goto('/ceci-nexiste-pas');
    expect(response.status()).toBe(404);
    await expect(page.locator('h1')).toContainText("n'existe pas");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

test('SEO : sitemap, robots, manifest', async ({ request }) => {
    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
    expect(await sitemap.text()).toContain('/catalogue.html');
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:');
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBeTruthy();
});
