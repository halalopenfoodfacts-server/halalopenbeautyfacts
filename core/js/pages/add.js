import { api } from '../lib/api.js';
import { isValidGtin, normalizeBarcode } from '../lib/barcode.js';
import { html, raw } from '../lib/html.js';
import { statusOf } from '../lib/halal.js';
import { SITE } from '../lib/site.js';
import { $, icon, setHtml } from '../ui/dom.js';
import { initShell } from '../ui/shell.js';
import { renderError } from '../ui/state.js';
import { statusBadge } from '../ui/status.js';

initShell();

const form = $('[data-add-form]');
const input = form.elements.code;
const error = $('#add-code-error');
const result = $('[data-add-result]');

function fail(message) {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = normalizeBarcode(input.value);
    if (!/^\d{8,14}$/.test(code)) { fail('Saisissez 8 à 14 chiffres.'); return; }
    if (!isValidGtin(code)) { fail('Ce code-barres semble mal recopié (clé de contrôle incorrecte). Vérifiez les chiffres.'); return; }
    error.hidden = true;
    input.removeAttribute('aria-invalid');
    const button = form.querySelector('[type="submit"]');
    button.classList.add('is-loading');
    const editUrl = `${SITE.upstream.productUrl}${encodeURIComponent(code)}`;
    try {
        const { product } = await api.product(code);
        setHtml(result, html`<div class="callout">${raw(icon('i-halal'))}<div class="stack" style="gap:.5rem">
            <span><strong>${product.product_name || code}</strong> est déjà dans la base. ${statusBadge(statusOf(product))}</span>
            <span class="cluster"><a class="btn btn--sm btn--primary" href="/product.html?code=${encodeURIComponent(code)}">Voir la fiche</a>
            <a class="btn btn--sm" href="${editUrl}" target="_blank" rel="noopener">Corriger sur ${SITE.upstream.name}</a></span>
        </div></div>`);
    } catch (err) {
        if (err.kind === 'not-found') {
            setHtml(result, html`<div class="callout callout--warn">${raw(icon('i-plus'))}<div class="stack" style="gap:.5rem">
                <span>Ce produit n'est pas encore référencé : merci de l'ajouter !</span>
                <span><a class="btn btn--sm btn--primary" href="${SITE.upstream.addUrl}${encodeURIComponent(code)}" target="_blank" rel="noopener">Créer la fiche sur ${SITE.upstream.name}</a></span>
            </div></div>`);
        } else {
            renderError(result, err, () => form.requestSubmit());
        }
    } finally {
        button.classList.remove('is-loading');
    }
});
input.addEventListener('input', () => { if (!error.hidden) { error.hidden = true; input.removeAttribute('aria-invalid'); } });
