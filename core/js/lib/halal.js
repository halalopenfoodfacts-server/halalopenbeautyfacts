// Présentation des statuts halal calculés par le backend (products/halal.py).
// Le statut n'est jamais porté par la seule couleur : icône + libellé + description.

export const STATUSES = ['halal', 'haram', 'doubtful', 'unknown'];

export const STATUS_META = {
    halal: {
        icon: 'i-halal',
        label: 'Halal',
        short: 'Halal',
        seal: 'Halal',
        description: 'Un label halal est déclaré, ou la liste des ingrédients ne contient ni alcool ni porc.',
    },
    haram: {
        icon: 'i-haram',
        label: 'Non conforme',
        short: 'Haram',
        seal: 'Alcool / non halal',
        description: 'Les ingrédients contiennent de l\'alcool ou du porc, ou un label le signale.',
    },
    doubtful: {
        icon: 'i-doubtful',
        label: 'Douteux',
        short: 'Douteux',
        seal: 'À vérifier',
        description: 'Un ingrédient sensible (gélatine, E120, E471…) ou des informations contradictoires demandent une vérification.',
    },
    unknown: {
        icon: 'i-unknown',
        label: 'Non renseigné',
        short: 'Inconnu',
        seal: 'Aucune info',
        description: 'La liste des ingrédients n\'est pas renseignée : impossible de se prononcer.',
    },
};

export function statusOf(product) {
    const status = product?.halal_status;
    return STATUSES.includes(status) ? status : 'unknown';
}

/** Repère les ingrédients sensibles dans un texte (mise en évidence sur la fiche). */
export function highlightRanges(text, words = []) {
    const source = String(text ?? '');
    if (!source || !words.length) return [];
    const folded = source.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const ranges = [];
    for (const word of words) {
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${word})(?=$|[^\\p{L}\\p{N}])`, 'giu');
        for (const match of folded.matchAll(pattern)) {
            const start = match.index + match[1].length;
            ranges.push([start, start + match[2].length]);
        }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    return ranges.filter((range, index) => index === 0 || range[0] >= ranges[index - 1][1]);
}
