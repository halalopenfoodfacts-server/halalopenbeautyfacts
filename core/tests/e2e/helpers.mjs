import { readFileSync } from 'node:fs';
import { expect, test as base } from '@playwright/test';

export const SITE = JSON.parse(readFileSync(new URL('../../../site/site.config.json', import.meta.url), 'utf8'));
export const FIX = SITE.testFixtures;

/** Échoue si la page produit une erreur JS, une violation CSP ou une erreur console. */
export const test = base.extend({
    page: async ({ page }, use, testInfo) => {
        const problems = [];
        page.on('pageerror', (error) => problems.push(`exception: ${error.message}`));
        page.on('console', (message) => {
            if (message.type() !== 'error') return;
            const text = message.text();
            // 404 attendues (pages d'erreur testées, produits absents) et images tierces manquantes
            if (/status of 404|images\.open(food|beauty)facts|ERR_BLOCKED_BY_ORB|net::ERR_FAILED|status of 50\d/.test(text)) return;
            problems.push(`console: ${text}`);
        });
        await use(page);
        if (!testInfo.annotations.some((a) => a.type === 'allow-errors')) {
            expect(problems, 'erreurs JS / CSP / console').toEqual([]);
        }
    },
});
export { expect };

export async function noHorizontalOverflow(page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(1);
}
