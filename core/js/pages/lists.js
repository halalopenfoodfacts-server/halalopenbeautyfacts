import { formatRelative } from '../lib/format.js';
import { html, raw } from '../lib/html.js';
import { LISTS, lists } from '../lib/storage.js';
import { bindImageFallbacks, productImage } from '../ui/card.js';
import { $, $$, icon, setHtml } from '../ui/dom.js';
import { currentLang } from '../ui/i18n-dom.js';
import { initShell } from '../ui/shell.js';
import { renderState } from '../ui/state.js';
import { statusBadge } from '../ui/status.js';
import { toast } from '../ui/toast.js';

initShell();

const panel = $('[data-panel]');
const tabs = $$('[role="tab"]');
const clearButton = $('[data-clear]');
let current = new URLSearchParams(window.location.search).get('liste') || 'fav';
let armed = false;

const items = (name) => (name === 'history' ? lists.history() : lists.get(name));

function counts() {
    tabs.forEach((tab) => { $(`[data-count="${tab.dataset.tab}"]`).textContent = items(tab.dataset.tab).length; });
}

function render() {
    tabs.forEach((tab) => {
        const selected = tab.dataset.tab === current;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected) panel.setAttribute('aria-labelledby', tab.id);
    });
    counts();
    armed = false;
    clearButton.querySelector('span').textContent = current === 'history' ? 'Effacer l\'historique' : 'Vider cette liste';
    const entries = items(current);
    clearButton.disabled = !entries.length;
    if (!entries.length) {
        renderState(panel, {
            title: current === 'history' ? 'Aucun produit consulté' : 'Cette liste est vide',
            message: current === 'history' ? 'Les fiches que vous ouvrez apparaîtront ici.' : 'Depuis une fiche produit, utilisez les boutons Favoris, Liste de courses ou À éviter.',
            icon: current === 'history' ? 'i-refresh' : LISTS[current]?.icon || 'i-bookmark',
            actions: [{ label: 'Parcourir le catalogue', href: '/catalogue.html', primary: true }],
        });
        return;
    }
    const lang = currentLang();
    setHtml(panel, html`<ul class="list-stack" style="list-style:none;padding:0">${entries.map((item) => html`<li class="list-item">
        ${productImage(item.img, item.name || item.code, { width: 64, height: 64 })}
        <div>
            <a href="/product.html?code=${encodeURIComponent(item.code)}">${item.name || item.code}</a>
            <small>${item.brand || ''}${item.date ? ` · ${formatRelative(Date.parse(item.date) / 1000, lang)}` : ''}</small>
            <div style="margin-top:.35rem">${statusBadge(item.status || 'unknown')}</div>
        </div>
        ${current === 'history' ? '' : html`<button class="btn btn--ghost btn--icon btn--sm" type="button" data-remove="${item.code}" aria-label="Retirer ${item.name || item.code}">${raw(icon('i-x'))}</button>`}
    </li>`)}</ul>`);
    bindImageFallbacks(panel);
    $$('[data-remove]', panel).forEach((button) => button.addEventListener('click', () => {
        lists.remove(current, button.dataset.remove);
        toast('Produit retiré', { duration: 1800 });
        render();
    }));
}

tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { current = tab.dataset.tab; render(); });
    tab.addEventListener('keydown', (event) => {
        const delta = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!delta) return;
        const next = tabs[(index + delta + tabs.length) % tabs.length];
        next.focus();
        next.click();
    });
});

clearButton.addEventListener('click', () => {
    // Confirmation en deux temps, sans boîte modale bloquante
    if (!armed) {
        armed = true;
        clearButton.querySelector('span').textContent = 'Cliquez encore pour confirmer';
        setTimeout(() => { if (armed) render(); }, 4000);
        return;
    }
    if (current === 'history') lists.clearHistory();
    else lists.clear(current);
    toast('Liste vidée', { type: 'success' });
    render();
});

$('[data-export]').addEventListener('click', () => {
    const data = Object.fromEntries([...Object.keys(LISTS), 'history'].map((name) => [name, items(name)]));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'mes-listes-halal.json' });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

if (!['fav', 'cart', 'black', 'history'].includes(current)) current = 'fav';
render();
