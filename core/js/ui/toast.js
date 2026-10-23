import { escapeHtml } from '../lib/html.js';

const ICONS = { success: 'i-halal', error: 'i-alert', info: 'i-info' };

export function toast(message, { type = 'info', action = null, duration = 3200 } = {}) {
    const region = document.getElementById('toasts');
    if (!region) return;
    const item = document.createElement('div');
    item.className = `toast toast--${type}`;
    item.innerHTML = `<svg aria-hidden="true"><use href="#${ICONS[type] || ICONS.info}"/></svg><span>${escapeHtml(message)}</span>`;
    if (action) {
        const link = document.createElement('a');
        link.href = action.href;
        link.textContent = action.label;
        item.append(link);
    }
    region.append(item);
    const remove = () => {
        item.classList.add('is-leaving');
        item.addEventListener('animationend', () => item.remove(), { once: true });
        setTimeout(() => item.remove(), 400);
    };
    setTimeout(remove, duration);
}
