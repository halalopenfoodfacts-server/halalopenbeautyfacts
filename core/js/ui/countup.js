import { formatNumber } from '../lib/format.js';
import { reducedMotion } from './dom.js';
import { currentLang } from './i18n-dom.js';

export function countUp(element, target, duration = 1100) {
    const lang = currentLang();
    if (reducedMotion() || !Number.isFinite(target)) { element.textContent = formatNumber(target, lang); return; }
    const start = performance.now();
    const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        element.textContent = formatNumber(target * (1 - (1 - progress) ** 3), lang);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
