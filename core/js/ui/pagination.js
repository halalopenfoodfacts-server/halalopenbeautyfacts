import { t } from './i18n-dom.js';

/** Pagination en liens réels (crawlables), interceptés pour une navigation sans rechargement. */
export function renderPagination(container, { page, pageCount, hrefFor, onNavigate }) {
    container.innerHTML = '';
    if (pageCount <= 1) return;
    const nav = document.createElement('nav');
    nav.className = 'pagination';
    nav.setAttribute('aria-label', t('common.page'));
    const add = (label, target, { current = false, disabled = false, aria = '' } = {}) => {
        const element = document.createElement(disabled || current ? 'span' : 'a');
        element.textContent = label;
        if (aria) element.setAttribute('aria-label', aria);
        if (current) element.setAttribute('aria-current', 'page');
        if (disabled) element.className = 'is-disabled';
        if (!disabled && !current) {
            element.href = hrefFor(target);
            element.addEventListener('click', (event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                onNavigate(target);
            });
        }
        nav.append(element);
    };
    add('‹', page - 1, { disabled: page <= 1, aria: t('common.previous') });
    const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
    let previous = 0;
    for (const p of [...pages].sort((a, b) => a - b)) {
        if (p - previous > 1) {
            const gap = document.createElement('span');
            gap.className = 'gap';
            gap.textContent = '…';
            gap.setAttribute('aria-hidden', 'true');
            nav.append(gap);
        }
        add(String(p), p, { current: p === page, aria: `${t('common.page')} ${p}` });
        previous = p;
    }
    add('›', page + 1, { disabled: page >= pageCount, aria: t('common.next') });
    container.append(nav);
}
