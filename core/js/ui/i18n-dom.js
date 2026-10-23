import { isRtl, normalizeLang, translate } from '../lib/i18n.js';
import { store } from '../lib/storage.js';

const KEY = 'hof-lang';
const LEGACY_KEYS = ['hobf_language', 'hoff_language'];

export function currentLang() {
    const stored = store.readRaw(KEY) || LEGACY_KEYS.map((key) => store.readRaw(key)).find(Boolean);
    return normalizeLang(stored || 'fr');
}

export const t = (key, vars) => translate(key, currentLang(), vars);

export function applyTranslations(root = document, lang = currentLang()) {
    for (const element of root.querySelectorAll('[data-i18n]')) {
        element.textContent = translate(element.dataset.i18n, lang);
    }
    for (const element of root.querySelectorAll('[data-i18n-aria]')) {
        element.setAttribute('aria-label', translate(element.dataset.i18nAria, lang));
    }
    for (const element of root.querySelectorAll('[data-i18n-placeholder]')) {
        element.setAttribute('placeholder', translate(element.dataset.i18nPlaceholder, lang));
    }
}

export function setLang(value) {
    const lang = normalizeLang(value);
    store.writeRaw(KEY, lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = isRtl(lang) ? 'rtl' : 'ltr';
    applyTranslations(document, lang);
    for (const select of document.querySelectorAll('[data-lang-select]')) select.value = lang;
    window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}
