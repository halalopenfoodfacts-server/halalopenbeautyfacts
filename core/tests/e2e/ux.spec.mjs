import { expect, FIX, test } from './helpers.mjs';

test('scanner : caméra indisponible → saisie manuelle, validation et verdict', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-scan]:visible').first().click();
    const dialog = page.locator('#scanner');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-scanner-message]')).not.toBeEmpty();   // pas de caméra en headless
    await dialog.locator('#manual-code').fill('12ab');
    await dialog.locator('[data-scanner-form] [type="submit"]').click();
    await expect(dialog.locator('#manual-code-error')).toBeVisible();
    await dialog.locator('#manual-code').fill(FIX.halalProduct);
    await dialog.locator('[data-scanner-form] [type="submit"]').click();
    await expect(dialog.locator('.seal')).toBeVisible();
    await expect(dialog.locator('a', { hasText: 'Voir la fiche' })).toHaveAttribute('href', new RegExp(FIX.halalProduct));
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
});

test('menu mobile : ouverture, focus piégé, fermeture Échap', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile uniquement');
    await page.goto('/');
    await expect(page.locator('.tabbar')).toBeVisible();
    await page.locator('.header-actions [data-menu-open]').click();
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeVisible();
    await expect(page.locator('[data-menu-close]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
});

test('thème sombre mémorisé', async ({ page }) => {
    await page.goto('/');
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.locator('[data-theme-toggle]').first().click();
    await page.reload();
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(['dark', 'light']).toContain(theme);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(before);
});

test('langues : anglais puis arabe (RTL)', async ({ page }) => {
    await page.goto('/catalogue.html');
    await page.evaluate(() => localStorage.setItem('hof-lang', 'en'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-i18n="filters.status"]').first()).toHaveText('Halal status');
    await page.evaluate(() => localStorage.setItem('hof-lang', 'ar'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('navigation clavier : lien d\'évitement vers le contenu', async ({ page, isMobile }) => {
    test.skip(isMobile, 'clavier : desktop');
    await page.goto('/learn.html');
    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#contenu')).toBeFocused();
});

test('vérificateur d\'ingrédient : mot entier (« vinaigre » n\'est pas « vin »)', async ({ page }) => {
    await page.goto('/learn.html');
    await page.locator('#checker-input').fill('vinaigre');
    await page.locator('[data-checker] [type="submit"]').click();
    await expect(page.locator('[data-checker-result]')).toContainText("n'est pas dans notre liste");
    await page.locator('#checker-input').fill(FIX.checkerHaram);
    await page.locator('[data-checker] [type="submit"]').click();
    await expect(page.locator('.checker-result--haram')).toBeVisible();
});

test.describe('PWA', () => {
    test.use({ serviceWorkers: 'allow' });
    test('hors ligne : page de repli', async ({ page, context }) => {
    test.info().annotations.push({ type: 'allow-errors' });
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    await page.goto('/blog.html').catch(() => {});
    await expect(page.locator('h1')).toContainText(/hors ligne|Guides/);
    await context.setOffline(false);
});
});
