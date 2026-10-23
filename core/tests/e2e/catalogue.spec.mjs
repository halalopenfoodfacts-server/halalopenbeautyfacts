import { expect, test } from './helpers.mjs';

test('filtre « Halal déclaré » : URL partageable et badges cohérents', async ({ page, isMobile }) => {
    await page.goto('/catalogue.html');
    await expect(page.locator('[data-results] .product-card').first()).toBeVisible();
    if (isMobile) await page.locator('[data-filters-open]').click();
    await page.locator('.status-filter label').filter({ hasText: 'Halal déclaré' }).click();
    if (isMobile) await page.locator('.filters [data-filters-close]').last().click();
    await expect(page).toHaveURL(/statut=halal/);
    const badges = page.locator('[data-results] .product-card .status');
    await expect(badges.first()).toBeVisible();
    const statuses = await badges.evaluateAll((items) => items.map((b) => b.className));
    expect(statuses.every((c) => c.includes('status--halal'))).toBeTruthy();
});

test('pagination et bouton Retour', async ({ page }) => {
    await page.goto('/catalogue.html');
    const first = await page.locator('[data-results] .product-card').first().getAttribute('data-code');
    await page.locator('.pagination a', { hasText: '2' }).first().click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator('.pagination [aria-current="page"]')).toHaveText('2');
    await expect(page.locator('[data-results] .product-card').first()).not.toHaveAttribute('data-code', first);
    await page.goBack();
    await expect(page.locator('.pagination [aria-current="page"]')).toHaveText('1');
    await expect(page.locator('[data-results] .product-card').first()).toHaveAttribute('data-code', first);
});

test('aucun résultat : état vide avec réinitialisation', async ({ page }) => {
    await page.goto('/catalogue.html?q=zzqxwvnotaproduct');
    await expect(page.locator('.state h2')).toHaveText('Aucun produit ne correspond');
    await page.locator('.state button', { hasText: 'Réinitialiser' }).click();
    await expect(page).toHaveURL(/catalogue\.html$/);
    await expect(page.locator('[data-results] .product-card').first()).toBeVisible();
});

test('API en panne : message clair puis « Réessayer » fonctionne', async ({ page }) => {
    let fail = true;
    await page.route('**/proxy/v2/search**', (route) => (fail
        ? route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>500</h1>' })
        : route.continue()));
    await page.goto('/catalogue.html');
    await expect(page.locator('.state--error')).toContainText('momentanément indisponible');
    fail = false;
    await page.locator('.state--error button', { hasText: 'Réessayer' }).click();
    await expect(page.locator('[data-results] .product-card').first()).toBeVisible();
});

test('« Non conformes » : produits affichés sans fausse erreur (régression AUDIT B1)', async ({ page }) => {
    await page.goto('/excluded.html');
    await expect(page.locator('[data-results] .product-card').first()).toBeVisible();
    await expect(page.locator('.state--error')).toHaveCount(0);
    const statuses = await page.locator('[data-results] .product-card .status').evaluateAll((items) => items.map((b) => b.className));
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((c) => c.includes('status--haram'))).toBeTruthy();
    // La recherche sur cette page filtre réellement (avant : paramètre ignoré)
    await page.locator('#catalogue-q').fill('bière');
    await page.locator('#catalogue-q').press('Enter');
    await expect(page).toHaveURL(/q=bi%C3%A8re|q=bière/);
    await expect(page.locator('[data-count]')).not.toHaveText('Chargement…');
});
