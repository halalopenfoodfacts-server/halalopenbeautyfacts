// Infobulle des graphiques : survol, toucher et focus clavier sur tout élément [data-tip].
// Une seule bulle pour la page, placée au-dessus de la marque (et gardée dans l'écran).
let bubble;

function ensureBubble() {
    if (bubble) return bubble;
    bubble = document.createElement('div');
    bubble.className = 'chart-tip';
    bubble.setAttribute('role', 'tooltip');
    bubble.hidden = true;
    document.body.append(bubble);
    return bubble;
}

function show(target, x, y) {
    const tip = ensureBubble();
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    const rect = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - rect.width / 2), window.innerWidth - rect.width - 8);
    const top = y - rect.height - 12 < 8 ? y + 16 : y - rect.height - 12;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function hide() {
    if (bubble) bubble.hidden = true;
}

export function bindTooltips(root) {
    for (const target of root.querySelectorAll('[data-tip]')) {
        target.addEventListener('pointerenter', (event) => show(target, event.clientX, event.clientY));
        target.addEventListener('pointermove', (event) => show(target, event.clientX, event.clientY));
        target.addEventListener('pointerleave', hide);
        target.addEventListener('focus', () => {
            const rect = target.getBoundingClientRect();
            show(target, rect.left + rect.width / 2, rect.top);
        });
        target.addEventListener('blur', hide);
    }
}
