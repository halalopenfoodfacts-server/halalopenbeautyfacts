// Construction HTML sûre : toute valeur interpolée est échappée, sauf si elle est
// marquée explicitement comme sûre (raw / résultat d'un autre gabarit html``).
export class SafeHtml {
    constructor(value) { this.value = value; }
    toString() { return this.value; }
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;');
}

export const raw = (value) => new SafeHtml(String(value ?? ''));

function interpolate(value) {
    if (value instanceof SafeHtml) return value.value;
    if (Array.isArray(value)) return value.map(interpolate).join('');
    if (value === false || value == null) return '';
    return escapeHtml(value);
}

export function html(strings, ...values) {
    let out = strings[0];
    values.forEach((value, index) => { out += interpolate(value) + strings[index + 1]; });
    return new SafeHtml(out);
}

/** URL http(s) uniquement (évite javascript:, data:…) */
export function safeUrl(value, fallback = '') {
    try {
        const url = new URL(String(value), 'https://placeholder.invalid');
        return ['https:', 'http:'].includes(url.protocol) && String(value).startsWith('http') ? url.href : fallback;
    } catch {
        return fallback;
    }
}
