import { api } from '../lib/api.js';
import { formatNumber } from '../lib/format.js';
import { html } from '../lib/html.js';
import { SITE } from '../lib/site.js';
import { $, setHtml } from '../ui/dom.js';
import { currentLang } from '../ui/i18n-dom.js';
import { initShell } from '../ui/shell.js';
import { renderError } from '../ui/state.js';

initShell();

async function load() {
    const list = $('[data-contributors]');
    list.innerHTML = '<li class="skeleton" style="height:16rem"></li>';
    try {
        const { tags = [], count } = await api.facet('contributors');
        const lang = currentLang();
        const profile = `${SITE.upstream.url}/contributor/`;
        $('[data-contributors-total]').textContent = count ? `${formatNumber(count, lang)} contributeurs au total.` : '';
        setHtml(list, html`${tags.slice(0, 25).map((tag) => html`<li>
            <a href="${profile}${encodeURIComponent(tag.id)}" target="_blank" rel="noopener">${tag.name}</a>
            <span class="mono">${formatNumber(tag.products, lang)} fiches</span>
        </li>`)}`);
    } catch (error) {
        renderError(list, error, load);
    } finally {
        list.setAttribute('aria-busy', 'false');
    }
}
load();
