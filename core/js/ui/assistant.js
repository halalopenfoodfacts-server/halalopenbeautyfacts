// Halal Assistant : bouton flottant et fenêtre de chat. Chargé seulement si l'API répond
// { enabled: true } (shell.js). Tout passe par notre back-end (/proxy/v2/assistant) : aucune clé ici.
// Le texte du modèle est inséré avec textContent, jamais comme du HTML ; seuls les liens vers nos
// deux sites deviennent cliquables.
import { $ } from './dom.js';
import { currentLang, t } from './i18n-dom.js';

const MAX_QUESTION = 500;
const MAX_HISTORY = 6;
const TIMEOUT_MS = 60_000;
const OWN_LINK = /(https:\/\/halalopen(?:food|beauty)facts\.org\/[^\s)<>"']*)/g;

const history = [];
let busy = false;

function productCode() {
    if (!/\/product\.html$/.test(window.location.pathname)) return '';
    const code = new URLSearchParams(window.location.search).get('code') || '';
    return /^[0-9A-Za-z_-]{1,64}$/.test(code) ? code : '';
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/** Texte du modèle → paragraphes, **gras** et liens vers nos sites, sans HTML. */
export function renderRich(container, text) {
    container.replaceChildren();
    for (const paragraph of text.trim().split(/\n{2,}/)) {
        const p = el('p');
        paragraph.split('\n').forEach((line, index) => {
            if (index) p.append(document.createElement('br'));
            line.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
                if (/^\*\*[^*]+\*\*$/.test(part)) { p.append(el('strong', '', part.slice(2, -2))); return; }
                part.split(OWN_LINK).forEach((piece, i) => {
                    if (i % 2) {
                        const url = piece.replace(/[.,;:!?]+$/, '');
                        const a = el('a', '', url.includes('product.html') ? t('assistant.openSheet') : url);
                        a.href = url;
                        p.append(a, piece.slice(url.length));
                    } else if (piece) {
                        p.append(piece);
                    }
                });
            });
        });
        container.append(p);
    }
}

function bubble(log, role, text = '') {
    const item = el('div', `assistant-msg assistant-msg--${role}`);
    const body = el('div', 'assistant-msg__body');
    if (text) (role === 'bot' ? renderRich(body, text) : (body.textContent = text));
    item.append(body);
    log.append(item);
    log.scrollTop = log.scrollHeight;
    return body;
}

function suggestionsFor(code) {
    return code
        ? [[t('assistant.s.compatible'), true], [t('assistant.s.alternative'), true], [t('assistant.s.ingredient'), false]]
        : [[t('assistant.s.search'), false], [t('assistant.s.e471'), true], [t('assistant.s.scanner'), true]];
}

async function readStream(response, onEvent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, cut);
            buffer = buffer.slice(cut + 2);
            for (const line of chunk.split('\n')) {
                if (line.startsWith('data: ')) {
                    try { onEvent(JSON.parse(line.slice(6))); } catch { /* morceau illisible ignoré */ }
                }
            }
        }
    }
}

async function ask(panel, question) {
    const log = $('.assistant-log', panel);
    const status = $('.assistant-status', panel);
    busy = true;
    panel.classList.add('is-busy');
    bubble(log, 'user', question);
    const body = bubble(log, 'bot');
    body.parentElement.classList.add('is-pending');
    status.textContent = t('assistant.thinking');
    let answer = '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const fail = (message) => {
        body.parentElement.classList.add('assistant-msg--error');
        body.textContent = message;
    };
    try {
        const response = await fetch('/proxy/v2/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, history: history.slice(-MAX_HISTORY), code: productCode(), lang: currentLang() }),
            signal: controller.signal,
        });
        if (!response.ok || !response.body) {
            const data = await response.json().catch(() => ({}));
            fail(data.error || t('assistant.error.unavailable'));
            return;
        }
        await readStream(response, (event) => {
            if (event.type === 'text') {
                answer += event.text;
                body.parentElement.classList.remove('is-pending');
                renderRich(body, answer);
                log.scrollTop = log.scrollHeight;
            } else if (event.type === 'tool') {
                status.textContent = t(event.name === 'explain_ingredient' ? 'assistant.lookingIngredient' : 'assistant.searching');
            } else if (event.type === 'error') {
                fail(event.message);
            } else if (event.type === 'done' && event.sources?.length) {
                const sources = el('p', 'assistant-sources', `${t('assistant.sources')} `);
                event.sources.forEach((source, i) => {
                    const a = el('a', '', source.name);
                    a.href = source.url;
                    sources.append(...(i ? [', ', a] : [a]));
                });
                body.append(sources);
            }
        });
        if (answer.trim()) {
            history.push({ role: 'user', text: question }, { role: 'assistant', text: answer.trim().slice(0, 1500) });
        } else if (!body.textContent) {
            fail(t('assistant.error.unavailable'));
        }
    } catch {
        fail(t(controller.signal.aborted ? 'assistant.error.timeout' : 'assistant.error.network'));
    } finally {
        clearTimeout(timer);
        body.parentElement.classList.remove('is-pending');
        status.textContent = '';
        panel.classList.remove('is-busy');
        busy = false;
        log.scrollTop = log.scrollHeight;
    }
}

function buildPanel() {
    const code = productCode();
    const panel = el('section', 'assistant-panel');
    panel.id = 'assistant-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'assistant-title');

    const head = el('header', 'assistant-head');
    const title = el('h2', '', 'Halal Assistant');
    title.id = 'assistant-title';
    const close = el('button', 'assistant-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t('assistant.close'));
    head.append(title, close);

    const disclaimer = el('p', 'assistant-disclaimer', t('assistant.disclaimer'));
    const log = el('div', 'assistant-log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    bubble(log, 'bot', t(code ? 'assistant.welcomeProduct' : 'assistant.welcome'));

    const chips = el('div', 'assistant-suggestions');
    const form = el('form', 'assistant-form');
    const input = el('textarea');
    input.name = 'question';
    input.rows = 1;
    input.maxLength = MAX_QUESTION;
    input.placeholder = t('assistant.placeholder');
    input.setAttribute('aria-label', t('assistant.placeholder'));
    const send = el('button', 'assistant-send', '➤');
    send.type = 'submit';
    send.setAttribute('aria-label', t('assistant.send'));
    form.append(input, send);
    const status = el('p', 'assistant-status');
    status.setAttribute('aria-live', 'polite');

    const submit = (question) => {
        const text = question.trim().slice(0, MAX_QUESTION);
        if (!text || busy) return;
        input.value = '';
        chips.hidden = true;
        ask(panel, text);
    };
    for (const [label, direct] of suggestionsFor(code)) {
        const chip = el('button', 'assistant-chip', label);
        chip.type = 'button';
        chip.addEventListener('click', () => {
            if (direct) { submit(label); return; }
            input.value = label.replace(/…$/, ' ');
            input.focus();
        });
        chips.append(chip);
    }
    form.addEventListener('submit', (event) => { event.preventDefault(); submit(input.value); });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(input.value); }
    });
    panel.append(head, disclaimer, log, chips, status, form);
    return { panel, close, input };
}

export function mountAssistant() {
    if (document.getElementById('assistant-panel')) return;
    const { panel, close, input } = buildPanel();
    const fab = el('button', 'assistant-fab');
    fab.type = 'button';
    fab.setAttribute('aria-controls', 'assistant-panel');
    fab.setAttribute('aria-expanded', 'false');
    fab.append(el('span', 'assistant-fab__icon', '💬'), el('span', 'assistant-fab__label', 'Halal Assistant'));
    const toggle = (open) => {
        panel.hidden = !open;
        fab.setAttribute('aria-expanded', String(open));
        fab.hidden = open;
        if (open) input.focus(); else fab.focus();
    };
    fab.addEventListener('click', () => toggle(true));
    close.addEventListener('click', () => toggle(false));
    panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') toggle(false); });
    document.body.append(fab, panel);
}
