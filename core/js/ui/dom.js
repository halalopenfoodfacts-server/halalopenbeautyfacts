export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function setHtml(element, safe) {
    element.innerHTML = String(safe);
    return element;
}

export function icon(name, className = '') {
    return `<svg class="${className}" aria-hidden="true"><use href="#${name}"/></svg>`;
}

export function debounce(fn, wait = 250) {
    let timer;
    const debounced = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
    debounced.cancel = () => clearTimeout(timer);
    return debounced;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Garde le focus dans un conteneur (menus, panneaux) ; renvoie la fonction de libération. */
export function trapFocus(container) {
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    const onKey = (event) => {
        if (event.key !== 'Tab') return;
        const items = $$(selector, container).filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    container.addEventListener('keydown', onKey);
    return () => container.removeEventListener('keydown', onKey);
}
