import { html, raw } from '../lib/html.js';
import { STATUS_META } from '../lib/halal.js';
import { translate } from '../lib/i18n.js';
import { currentLang } from './i18n-dom.js';

const label = (status) => translate(`status.${status}`, currentLang());

export function statusBadge(status, { size = '' } = {}) {
    const meta = STATUS_META[status] || STATUS_META.unknown;
    return html`<span class="status status--${status}${size ? ` status--${size}` : ''}" title="${meta.description}">${raw(`<svg aria-hidden="true"><use href="#${meta.icon}"/></svg>`)}<span>${label(status)}</span></span>`;
}

export function seal(status, { stamp = false } = {}) {
    const meta = STATUS_META[status] || STATUS_META.unknown;
    return html`<div class="seal seal--${status}${stamp ? ' is-stamping' : ''}" role="img" aria-label="${label(status)} — ${meta.seal}">
        <div class="seal__inner">
            <span class="seal__icon">${raw(`<svg aria-hidden="true"><use href="#${meta.icon}"/></svg>`)}</span>
            <span class="seal__label">${label(status)}</span>
            <span class="seal__note">${meta.seal}</span>
        </div>
    </div>`;
}
