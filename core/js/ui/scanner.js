// Scanner de codes-barres : BarcodeDetector natif (Chrome Android…) ou ZXing chargé à la
// demande (iOS Safari, Firefox). La saisie manuelle reste toujours disponible.
import { api } from '../lib/api.js';
import { isValidGtin, normalizeBarcode } from '../lib/barcode.js';
import { html } from '../lib/html.js';
import { statusOf } from '../lib/halal.js';
import { SITE, ZXING_URL } from '../lib/site.js';
import { lists } from '../lib/storage.js';
import { productImage, bindImageFallbacks } from './card.js';
import { $ } from './dom.js';
import { t } from './i18n-dom.js';
import { seal } from './status.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
let dialog;
let stream = null;
let stopDetection = () => {};
let busy = false;
let zxingPromise = null;

const el = (name) => dialog.querySelector(`[data-scanner-${name}]`);

function setStatus(text) {
    const status = el('status');
    if (status) status.textContent = text;
}

function showPlaceholder(message) {
    el('placeholder').hidden = false;
    el('message').textContent = message;
    el('status').hidden = true;
    dialog.querySelector('.scanner__laser').hidden = true;
}

function stopCamera() {
    stopDetection();
    stopDetection = () => {};
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const video = dialog?.querySelector('video');
    if (video) video.srcObject = null;
}

function loadZxing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    zxingPromise ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = ZXING_URL;
        script.onload = () => resolve(window.ZXing);
        script.onerror = () => { zxingPromise = null; reject(new Error('zxing')); };
        document.head.append(script);
    });
    return zxingPromise;
}

async function nativeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = FORMATS.filter((format) => supported.includes(format));
        return formats.length ? new window.BarcodeDetector({ formats }) : null;
    } catch {
        return null;
    }
}

async function startDetection(video, onCode) {
    const detector = await nativeDetector();
    if (detector) {
        let running = true;
        const tick = async () => {
            if (!running) return;
            try {
                const codes = await detector.detect(video);
                const code = codes.map((c) => c.rawValue).find((value) => isValidGtin(value));
                if (code) { running = false; onCode(code); return; }
            } catch { /* image pas encore prête */ }
            setTimeout(() => requestAnimationFrame(tick), 120);
        };
        tick();
        return () => { running = false; };
    }
    const ZXing = await loadZxing();
    const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]]]);
    const reader = new ZXing.BrowserMultiFormatReader(hints, 150);
    let done = false;
    reader.decodeFromStream(stream, video, (result) => {
        if (done || !result) return;
        const code = result.getText();
        if (isValidGtin(code)) { done = true; onCode(code); }
    });
    return () => { done = true; try { reader.reset(); } catch { /* déjà arrêté */ } };
}

async function startCamera() {
    const video = dialog.querySelector('video');
    el('placeholder').hidden = true;
    el('status').hidden = false;
    dialog.querySelector('.scanner__laser').hidden = false;
    dialog.querySelector('.scanner__frame').classList.remove('is-found');
    if (!navigator.mediaDevices?.getUserMedia) { showPlaceholder(t('scan.unavailable')); return; }
    setStatus(t('scan.starting'));
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
    } catch (error) {
        showPlaceholder(error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? t('scan.denied') : t('scan.unavailable'));
        return;
    }
    if (!dialog.open) { stopCamera(); return; }
    video.srcObject = stream;
    try { await video.play(); } catch { /* lecture automatique bloquée : l'image apparaît au premier geste */ }
    setStatus(t('scan.aim'));
    const track = stream.getVideoTracks()[0];
    const torch = el('torch');
    if (track?.getCapabilities?.().torch) {
        el('tools').hidden = false;
        torch.hidden = false;
        torch.onclick = async () => {
            const on = torch.getAttribute('aria-pressed') !== 'true';
            try { await track.applyConstraints({ advanced: [{ torch: on }] }); torch.setAttribute('aria-pressed', String(on)); } catch { /* non supporté */ }
        };
    }
    try {
        stopDetection = await startDetection(video, (code) => {
            dialog.querySelector('.scanner__frame').classList.add('is-found');
            setStatus(`${t('scan.found')} : ${code}`);
            navigator.vibrate?.(60);
            stopCamera();
            lookup(code);
        });
    } catch {
        showPlaceholder(t('scan.unavailable'));
    }
}

async function lookup(rawCode) {
    if (busy) return;
    const code = normalizeBarcode(rawCode);
    const result = el('result');
    busy = true;
    result.innerHTML = String(html`<div class="scan-result" aria-busy="true"><div class="skeleton scan-result__img"></div><div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line skeleton-line--short"></div></div></div>`);
    try {
        const { product } = await api.product(code, { retry: 1 });
        const status = statusOf(product);
        lists.remember(product);
        result.innerHTML = String(html`<div class="verdict-screen verdict-screen--${status}">
            ${seal(status, { stamp: true })}
            <strong class="verdict-screen__name">${product.product_name || product.code}</strong>
            ${product.brands ? html`<span class="muted">${product.brands}</span>` : ''}
            <div class="cluster verdict-screen__actions">
                <a class="btn btn--primary" href="/product.html?code=${encodeURIComponent(product.code)}">${t('scan.view')}</a>
                ${status === 'unknown' ? html`<button class="btn" type="button" data-ocr="${product.code}">Vérifier en photo</button>` : ''}
                <button class="btn" type="button" data-scan-again>${t('scan.again')}</button>
            </div>
        </div>`);
        bindImageFallbacks(result);
        // Vibration propre à chaque verdict, perceptible sans regarder l'écran
        navigator.vibrate?.({ halal: [60], doubtful: [60, 80, 60], haram: [220, 100, 220] }[status] || [40]);
    } catch (error) {
        const notFound = error.kind === 'not-found' || error.kind === 'bad-request';
        const message = notFound
            ? (isValidGtin(code) ? t('scan.notFound') : t('scan.checksum'))
            : t(`error.${error.kind === 'network' ? 'network' : 'server'}`);
        result.innerHTML = String(html`<div class="callout ${notFound ? '' : 'callout--warn'}" role="alert">
            <span>${message} <span class="mono">${code}</span></span>
        </div>
        <div class="cluster" style="margin-top:.75rem">
            ${notFound ? html`<button class="btn btn--primary btn--sm" type="button" data-ocr="${code}">Vérifier en photo</button>` : ''}
            ${notFound && SITE.upstream.addUrl ? html`<a class="btn btn--sm" href="${SITE.upstream.addUrl}${encodeURIComponent(code)}" target="_blank" rel="noopener">${t('scan.add')}</a>` : ''}
            ${notFound ? '' : html`<button class="btn btn--primary btn--sm" type="button" data-scan-retry>${t('common.retry')}</button>`}
            <button class="btn btn--sm" type="button" data-scan-again>${t('scan.again')}</button>
        </div>`);
        result.querySelector('[data-scan-retry]')?.addEventListener('click', () => lookup(code));
    } finally {
        busy = false;
        result.querySelector('[data-scan-again]')?.addEventListener('click', () => { result.innerHTML = ''; startCamera(); });
    }
}

function onManualSubmit(event) {
    event.preventDefault();
    const input = event.currentTarget.elements.code;
    const error = $('#manual-code-error', dialog);
    const code = normalizeBarcode(input.value);
    if (!/^\d{8,14}$/.test(code)) {
        error.textContent = t('scan.invalid');
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
    }
    error.hidden = true;
    input.removeAttribute('aria-invalid');
    stopCamera();
    showPlaceholder(`${t('scan.found')} : ${code}`);
    lookup(code);
}

export function openScanner() {
    dialog ??= document.getElementById('scanner');
    if (!dialog || dialog.open) return;
    if (!dialog.dataset.bound) {
        dialog.dataset.bound = '1';
        el('close').addEventListener('click', () => dialog.close());
        el('form').addEventListener('submit', onManualSubmit);
        dialog.addEventListener('close', () => { stopCamera(); el('result').innerHTML = ''; });
        dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    }
    el('result').innerHTML = '';
    dialog.showModal();
    startCamera();
}
