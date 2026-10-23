import { defineConfig, devices } from '@playwright/test';

// Tests de bout en bout sur dist/ servi comme en production (serve.mjs : mêmes routes /proxy,
// même CSP que deploy/nginx). API_TARGET : backend Django à utiliser (défaut 127.0.0.1:8000).
const PORT = Number(process.env.PORT || 4173);

export default defineConfig({
    testDir: 'core/tests/e2e',
    timeout: 45_000,
    expect: { timeout: 12_000 },
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    use: {
        baseURL: process.env.BASE_URL || `http://127.0.0.1:${PORT}`,
        trace: 'retain-on-failure',
        locale: 'fr-FR',
        // Le service worker contourne page.route() : bloqué sauf dans le test PWA dédié
        serviceWorkers: 'block',
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
        { name: 'mobile', use: { ...devices['Pixel 5'] } },
    ],
    webServer: process.env.BASE_URL ? undefined : {
        command: 'node core/tools/serve.mjs',
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: true,
        env: { PORT: String(PORT), API_TARGET: process.env.API_TARGET || 'http://127.0.0.1:8000' },
    },
});
