import { describeError } from '../lib/api.js';
import { html, raw } from '../lib/html.js';
import { t } from './i18n-dom.js';

/**
 * Affiche un état vide ou d'erreur dans `container`.
 * actions : [{ label, href }] ou [{ label, onClick, primary }]
 */
export function renderState(container, { kind = 'empty', title, message, icon = kind === 'error' ? 'i-alert' : 'i-search', actions = [] }) {
    container.innerHTML = String(html`<div class="state state--${kind}" role="${kind === 'error' ? 'alert' : 'status'}">
        <span class="state__icon">${raw(`<svg aria-hidden="true"><use href="#${icon}"/></svg>`)}</span>
        <h2>${title}</h2>
        ${message ? html`<p>${message}</p>` : ''}
        <div class="cluster"></div>
    </div>`);
    const row = container.querySelector('.cluster');
    actions.forEach((action) => {
        const element = document.createElement(action.href ? 'a' : 'button');
        element.className = `btn${action.primary ? ' btn--primary' : ''}`;
        element.textContent = action.label;
        if (action.href) element.href = action.href;
        else { element.type = 'button'; element.addEventListener('click', action.onClick); }
        row.append(element);
    });
    return container;
}

export function renderError(container, error, retry) {
    const { key, text } = describeError(error);
    const message = t(key) === key ? text : t(key);
    return renderState(container, {
        kind: 'error',
        icon: error?.kind === 'network' ? 'i-wifi-off' : 'i-alert',
        title: t('error.title'),
        message,
        actions: retry ? [{ label: t('common.retry'), onClick: retry, primary: true }] : [],
    });
}
