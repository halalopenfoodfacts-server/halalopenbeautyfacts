// Vérification d'une liste d'ingrédients en photo : le texte est lu sur l'appareil (Tesseract,
// chargé à la demande depuis /assets/ocr/), puis analysé par l'API avec la même règle que les
// fiches (alcool / porc → non conforme ; gélatine, E120… → douteux ; sinon halal).
import { api } from '../lib/api.js';
import { html, raw } from '../lib/html.js';
import { OCR_BASE, SITE } from '../lib/site.js';
import { currentLang, t } from './i18n-dom.js';
import { seal } from './status.js';

// Langue de l'étiquette → modèles Tesseract (l'arabe est souvent accompagné du français)
const OCR_LANGS = { fra: 'fra', ara: 'ara+fra', eng: 'eng' };
const DEFAULT_LANG = { fr: 'fra', ar: 'ara', en: 'eng', es: 'eng' };
const VIBRATION = { halal: [60], doubtful: [60, 80, 60], haram: [220, 100, 220], unknown: [40] };

let dialog;
let tesseract;
let worker = null;
let workerLangs = '';

const icon = (id) => raw(`<svg aria-hidden="true"><use href="#${id}"/></svg>`);

function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'dialog ocr';
    dialog.setAttribute('aria-labelledby', 'ocr-title');
    dialog.innerHTML = String(html`
        <div class="dialog__head">
            <h2 id="ocr-title">Vérifier les ingrédients en photo</h2>
            <button class="btn btn--ghost btn--icon" type="button" data-ocr-close aria-label="Fermer">${icon('i-x')}</button>
        </div>
        <div class="dialog__body stack">
            <p class="muted">Photographiez la liste des ingrédients sur l'emballage : le texte est lu sur votre appareil, puis vérifié (alcool, porc, gélatine, E120…).</p>
            <div class="field">
                <label class="label" for="ocr-lang">Langue de l'étiquette</label>
                <select class="select" id="ocr-lang" data-ocr-lang>
                    <option value="fra">Français</option>
                    <option value="ara">العربية + Français</option>
                    <option value="eng">English / Español</option>
                </select>
            </div>
            <label class="btn btn--primary btn--lg ocr__pick">
                ${icon('i-camera')}<span>Prendre la photo</span>
                <input type="file" accept="image/*" capture="environment" data-ocr-file hidden>
            </label>
            <img class="ocr__preview" alt="" data-ocr-preview hidden>
            <div class="ocr__progress" data-ocr-progress hidden>
                <div class="ocr__bar"><span data-ocr-bar></span></div>
                <p class="muted" data-ocr-step aria-live="polite"></p>
            </div>
            <div class="field" data-ocr-text-field hidden>
                <label class="label" for="ocr-text">Texte lu (corrigez-le si besoin)</label>
                <textarea class="input ocr__text" id="ocr-text" rows="5" data-ocr-text></textarea>
                <button class="btn" type="button" data-ocr-analyze>Analyser ce texte</button>
            </div>
            <div data-ocr-result aria-live="polite"></div>
        </div>`);
    document.body.append(dialog);
    dialog.querySelector('[data-ocr-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.querySelector('[data-ocr-file]').addEventListener('change', onFile);
    dialog.querySelector('[data-ocr-analyze]').addEventListener('click', () => analyze(dialog.querySelector('[data-ocr-text]').value));
}

const el = (name) => dialog.querySelector(`[data-ocr-${name}]`);

function progress(step, ratio) {
    el('progress').hidden = false;
    el('step').textContent = step;
    el('bar').style.width = `${Math.round((ratio || 0) * 100)}%`;
}

async function getWorker(langs) {
    if (worker && workerLangs === langs) return worker;
    await worker?.terminate();
    const moduleUrl = `${OCR_BASE}/tesseract.esm.min.js`;   // hors bundle : chargé seulement ici
    tesseract ??= await import(moduleUrl);
    worker = await tesseract.createWorker(langs.split('+'), 1, {
        workerPath: `${OCR_BASE}/worker.min.js`,
        corePath: OCR_BASE,
        langPath: `${OCR_BASE}/lang`,
        workerBlobURL: false,   // CSP : pas de worker « blob: »
        gzip: true,
        logger: (message) => {
            if (message.status === 'recognizing text') progress(t('ocr.reading'), message.progress);
            else progress(t('ocr.loading'), message.progress);
        },
    });
    workerLangs = langs;
    return worker;
}

async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const preview = el('preview');
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    el('result').innerHTML = '';
    el('text-field').hidden = true;
    progress(t('ocr.loading'), 0);
    try {
        const ocr = await getWorker(OCR_LANGS[el('lang').value] || 'fra');
        const { data } = await ocr.recognize(file);
        el('progress').hidden = true;
        const text = (data.text || '').replace(/\s+\n/g, '\n').trim();
        el('text').value = text;
        el('text-field').hidden = false;
        if (text.length < 8) {
            el('result').innerHTML = String(html`<div class="callout callout--warn">${icon('i-info')}<span>Texte illisible. Reprenez la photo de plus près, bien à plat et éclairée, ou saisissez les ingrédients ci-dessus.</span></div>`);
            return;
        }
        analyze(text);
    } catch {
        el('progress').hidden = true;
        el('text-field').hidden = false;
        el('result').innerHTML = String(html`<div class="callout callout--warn">${icon('i-info')}<span>La lecture de la photo a échoué sur cet appareil. Vous pouvez saisir les ingrédients ci-dessus.</span></div>`);
    }
}

async function analyze(text) {
    const result = el('result');
    if (!text.trim()) return;
    result.innerHTML = '<div class="skeleton skeleton-line"></div>';
    try {
        const verdict = await api.classify(text);
        const editUrl = dialog.dataset.code
            ? `${SITE.upstream.url}/cgi/product.pl?type=edit&code=${encodeURIComponent(dialog.dataset.code)}` : '';
        result.innerHTML = String(html`<div class="verdict-screen verdict-screen--${verdict.status}">
            ${seal(verdict.status, { stamp: true })}
            <p class="verdict-screen__summary">${verdict.summary}</p>
            ${verdict.reasons.length ? html`<ul class="reason-list">${verdict.reasons.map((reason) => html`<li>${reason.text}</li>`)}</ul>` : ''}
            <p class="muted">Résultat basé sur le texte lu : vérifiez qu'il correspond bien à l'emballage.</p>
            ${editUrl ? html`<a class="btn btn--primary" href="${editUrl}" target="_blank" rel="noopener">${icon('i-plus')}<span>Ajouter ces ingrédients à la fiche</span>${icon('i-external')}</a>` : ''}
        </div>`);
        navigator.vibrate?.(VIBRATION[verdict.status] || 40);
    } catch (error) {
        result.innerHTML = String(html`<div class="callout callout--warn">${icon('i-info')}<span>${t(`error.${error.kind === 'network' ? 'network' : 'server'}`)}</span></div>`);
    }
}

/** Ouvre la vérification en photo ; `code` (facultatif) propose d'ajouter le texte à cette fiche. */
export function openIngredientScan(code = '') {
    if (!dialog) build();
    dialog.dataset.code = code;
    el('lang').value = DEFAULT_LANG[currentLang()] || 'fra';
    el('result').innerHTML = '';
    el('preview').hidden = true;
    el('progress').hidden = true;
    el('text-field').hidden = true;
    dialog.showModal();
}
