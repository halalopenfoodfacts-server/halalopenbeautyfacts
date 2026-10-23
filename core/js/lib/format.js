const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar', es: 'es-ES' };

export function locale(lang = 'fr') {
    return LOCALES[lang] || 'fr-FR';
}

export function formatNumber(value, lang = 'fr') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return new Intl.NumberFormat(locale(lang)).format(Math.round(value));
}

export function formatCompact(value, lang = 'fr') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return new Intl.NumberFormat(locale(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** « en:halal-food-authority » → « Halal food authority » */
export function cleanTag(tag) {
    const text = String(tag ?? '').replace(/^[a-z]{2,3}:/i, '').replace(/[-_]+/g, ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

export function tagList(value) {
    if (!value) return [];
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list.map((item) => String(item).trim()).filter(Boolean);
}

export function formatDate(timestamp, lang = 'fr') {
    const seconds = Number(timestamp);
    if (!seconds) return '';
    const date = new Date(seconds * 1000);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(locale(lang), { year: 'numeric', month: 'long', day: 'numeric' });
}

export function formatRelative(timestamp, lang = 'fr', now = Date.now()) {
    const seconds = Number(timestamp);
    if (!seconds) return '';
    const diff = Math.round((seconds * 1000 - now) / 1000);
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    const formatter = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' });
    for (const [unit, size] of units) {
        if (Math.abs(diff) >= size) return formatter.format(Math.trunc(diff / size), unit);
    }
    return formatter.format(diff, 'second');
}

export function formatQuantity(value, unit, lang = 'fr') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const digits = value >= 10 ? 0 : 1;
    return `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(value)} ${unit}`;
}
