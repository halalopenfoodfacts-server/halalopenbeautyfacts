import { expect, FIX, test } from './helpers.mjs';

test('accueil : statistiques réelles et produits populaires', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-stat="total"]')).toHaveText(/\d[\d\s  ]{3,}/);
    await expect(page.locator('[data-rail="top"] .product-card').first()).toBeVisible();
    await expect(page.locator('[data-rail="top"] .product-card .status').first()).toBeVisible();
});

test('accueil : statistiques en cours de calcul → nouvel essai, jamais « Erreur »', async ({ page }) => {
    let calls = 0;
    await page.route('**/proxy/stats', (route) => {
        calls += 1;
        if (calls === 1) return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'Retry-After': '1' }, body: '{"status":"computing"}' });
        return route.fulfill({ contentType: 'application/json', body: '{"total":1234567,"halal":10,"excluded":5,"contributors":7,"countries":3}' });
    });
    await page.goto('/');
    await expect(page.locator('[data-stat="total"]')).toHaveText(/1.?234.?567/, { timeout: 15000 });
    await expect(page.locator('body')).not.toContainText('Erreur');
});

test('recherche instantanée puis page de résultats', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('#hero-search');
    await input.fill(FIX.searchQuery.slice(0, 5));
    const options = page.locator('[role="option"]');
    await expect(options.first()).toBeVisible();
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await input.press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await input.press('Escape');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await input.fill(FIX.searchQuery);
    await input.press('Enter');
    await expect(page).toHaveURL(new RegExp(`catalogue\\.html\\?q=${FIX.searchQuery}`));
    await expect(page.locator('[data-results] .product-card').first()).toBeVisible();
});

test('recherche d\'un code-barres : ouvre directement la fiche', async ({ page }) => {
    await page.goto('/');
    await page.locator('#hero-search').fill(FIX.halalProduct);
    await page.locator('#hero-search').press('Enter');
    await expect(page).toHaveURL(new RegExp(`product\\.html\\?code=${FIX.halalProduct}`));
    await expect(page.locator('.product-hero h1')).toBeVisible();
});
