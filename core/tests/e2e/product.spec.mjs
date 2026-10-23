import { expect, FIX, test } from './helpers.mjs';

test('fiche produit : statut, raisons, code-barres et métadonnées', async ({ page }) => {
    const apiResponse = page.waitForResponse((r) => r.url().includes(`/proxy/v2/product/${FIX.halalProduct}`));
    await page.goto(`/product.html?code=${FIX.halalProduct}`);
    const { product } = await (await apiResponse).json();
    await expect(page.locator('.product-hero h1')).toHaveText(product.product_name);
    await expect(page.locator(`.verdict--${product.halal_status}`)).toBeVisible();
    await expect(page.locator('.reasons li').first()).toBeVisible();
    await expect(page.locator('.barcode-figure svg')).toBeVisible();          // avant : bloqué par la CSP
    await expect(page).toHaveTitle(new RegExp(product.product_name));
    await expect(page.locator('[data-product]')).toHaveAttribute('aria-busy', 'false');
});

test('produit non conforme affiché comme tel (régression AUDIT H2)', async ({ page }) => {
    await page.goto(`/product.html?code=${FIX.haramProduct}`);
    await expect(page.locator('.verdict--haram')).toBeVisible();
    await expect(page.locator('.verdict')).not.toContainText('Halal déclaré');
});

test('produit inconnu : message explicite et lien d\'ajout', async ({ page }) => {
    test.info().annotations.push({ type: 'allow-errors' });
    await page.goto(`/product.html?code=${FIX.missingProduct}`);
    await expect(page.locator('.state h2')).toHaveText('Produit introuvable');
    await expect(page.locator('.state a', { hasText: 'Ajouter ce produit' })).toHaveAttribute('href', /http/);
});

test('données inattendues : la fiche s\'affiche quand même (régression AUDIT B1/B5)', async ({ page }) => {
    await page.route('**/proxy/v2/product/**', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: 1, product: {
            code: '1234567890128', product_name: 'Produit <b>bizarre</b>', brands: null, labels_tags: 'en:halal,en:organic',
            categories_tags: null, ingredients_text: null, nutriments: { energy_100g: 'abc' }, halal_status: 'nimporte', halal: null,
            image_front_url: 'javascript:alert(1)', additives_tags: 'en:e471',
        } }),
    }));
    await page.goto('/product.html?code=1234567890128');
    await expect(page.locator('.product-hero h1')).toHaveText('Produit <b>bizarre</b>');   // texte échappé, pas de HTML injecté
    await expect(page.locator('.verdict--unknown')).toBeVisible();
    await expect(page.locator('.state--error')).toHaveCount(0);
    await expect(page.locator('img[src^="javascript"]')).toHaveCount(0);
});

test('réseau coupé : message de connexion et nouvel essai', async ({ page }) => {
    test.info().annotations.push({ type: 'allow-errors' });
    let down = true;
    await page.route('**/proxy/v2/product/**', (route) => (down ? route.abort('internetdisconnected') : route.continue()));
    await page.goto(`/product.html?code=${FIX.halalProduct}`);
    await expect(page.locator('.state--error')).toContainText('connexion');
    down = false;
    await page.locator('.state--error button').click();
    await expect(page.locator('.product-hero h1')).toBeVisible();
});

test('listes : ajout depuis la fiche puis présence dans « Mes listes »', async ({ page }) => {
    await page.goto(`/product.html?code=${FIX.halalProduct}`);
    const favorite = page.locator('[data-list="fav"]');
    await favorite.click();
    await expect(favorite).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.toast')).toContainText('Ajouté');
    await page.goto('/my-lists.html');
    await expect(page.locator('[data-panel] .list-item')).toHaveCount(1);
    await page.locator('#tab-history').click();
    await expect(page.locator('[data-panel] .list-item').first()).toBeVisible();
    await page.locator('#tab-fav').click();
    await page.locator('[data-panel] [data-remove]').click();
    await expect(page.locator('[data-panel] .state')).toContainText('vide');
});

test('comparateur : deux produits → tableau', async ({ page }) => {
    await page.goto(`/compare.html?add=${FIX.halalProduct}`);
    await page.goto(`/compare.html?add=${FIX.haramProduct}`);
    await expect(page.locator('.compare-table')).toBeVisible();
    await expect(page.locator('.compare-table thead th')).toHaveCount(3);
});
