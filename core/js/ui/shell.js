// Comportements communs à toutes les pages.
import { store } from '../lib/storage.js';
import { $, $$, trapFocus } from './dom.js';
import { currentLang, setLang, switchLang, t } from './i18n-dom.js';
import { translatePage } from './translate-page.js';
import { toast } from './toast.js';

const THEME_KEY = 'hof-theme';

function initHeader() {
    const header = $('#site-header');
    if (!header) return;
    const update = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', update, { passive: true });
    update();
}

function initTheme() {
    // Reprise de l'ancien réglage (« hoff-theme ») pour ne pas perdre le choix des visiteurs
    if (!store.readRaw(THEME_KEY) && store.readRaw('hoff-theme')) {
        store.writeRaw(THEME_KEY, store.readRaw('hoff-theme'));
        document.documentElement.dataset.theme = store.readRaw(THEME_KEY);
    }
    for (const button of $$('[data-theme-toggle]')) {
        button.addEventListener('click', () => {
            const current = document.documentElement.dataset.theme
                || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            store.writeRaw(THEME_KEY, next);
            toast(t(next === 'dark' ? 'theme.dark' : 'theme.light'), { duration: 1600 });
        });
    }
}

function initLang() {
    const lang = currentLang();
    for (const select of $$('[data-lang-select]')) {
        select.value = lang;
        select.addEventListener('change', () => switchLang(select.value));
    }
    if (lang !== 'fr') setLang(lang);
    translatePage(lang);
}

function initMenu() {
    const menu = $('#mobile-menu');
    if (!menu) return;
    let release = () => {};
    let opener = null;
    const openers = $$('[data-menu-open]');
    const close = () => {
        menu.hidden = true;
        release();
        document.body.style.overflow = '';
        openers.forEach((button) => button.setAttribute('aria-expanded', 'false'));
        opener?.focus();
    };
    openers.forEach((button) => button.addEventListener('click', () => {
        opener = button;
        menu.hidden = false;
        document.body.style.overflow = 'hidden';
        openers.forEach((b) => b.setAttribute('aria-expanded', 'true'));
        release = trapFocus(menu);
        $('[data-menu-close]', menu)?.focus();
    }));
    $('[data-menu-close]', menu)?.addEventListener('click', close);
    menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    $$('a', menu).forEach((link) => link.addEventListener('click', () => { menu.hidden = true; document.body.style.overflow = ''; }));
}

function initScanButtons() {
    const open = async () => {
        const { openScanner } = await import('./scanner.js');
        openScanner();
    };
    $$('[data-scan]').forEach((button) => button.addEventListener('click', open));
    // Raccourci PWA « Scanner » (manifest) et liens /?scan=1
    if (new URLSearchParams(window.location.search).get('scan') === '1') open();
}

function initNetwork() {
    let banner = null;
    const update = () => {
        if (navigator.onLine) {
            if (banner) { banner.remove(); banner = null; toast(t('common.online'), { type: 'success', duration: 2000 }); }
            return;
        }
        if (banner) return;
        banner = document.createElement('div');
        banner.className = 'net-banner';
        banner.setAttribute('role', 'status');
        banner.textContent = t('common.offline');
        $('#site-header')?.after(banner);
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if (!navigator.onLine) update();
}

function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').catch(() => { /* PWA facultative */ });
    });
}

function initReveal() {
    const items = $$('.reveal');
    if (!items.length) return;
    if (!('IntersectionObserver' in window)) { items.forEach((item) => item.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
        });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach((item) => observer.observe(item));
}

/** Boutons « Vérifier en photo » (data-ocr="<code facultatif>") : module chargé au premier clic. */
function initIngredientScan() {
    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-ocr]');
        if (!button) return;
        event.preventDefault();
        import('./ingredient-scan.js').then(({ openIngredientScan }) => openIngredientScan(button.dataset.ocr || ''));
    });
}

export function initShell() {
    initHeader();
    initIngredientScan();
    initTheme();
    initLang();
    initMenu();
    initScanButtons();
    initNetwork();
    initServiceWorker();
    initReveal();
}
