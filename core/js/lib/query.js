// État du catalogue ⇄ URL de la page (partageable) ⇄ paramètres de l'API.

export const SORTS = { popularity: 'unique_scans_n', recent: 'last_modified_t', name: 'product_name' };
export const STATUS_FILTERS = ['', 'halal', 'haram', 'doubtful', 'unknown'];
export const PAGE_SIZE = 24;
export const MAX_PAGE = 200;

export function emptyState() {
    return { q: '', status: '', labels: [], category: '', country: '', nutriscore: [], nova: [], palmFree: false, sort: 'popularity', page: 1 };
}

const list = (params, key) => params.getAll(key).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);

export function parseState(search, preset = {}) {
    const params = new URLSearchParams(search);
    const state = emptyState();
    state.q = (params.get('q') || '').trim().slice(0, 200);
    state.status = STATUS_FILTERS.includes(params.get('statut')) ? params.get('statut') : '';
    state.labels = list(params, 'label');
    state.category = params.get('categorie') || '';
    state.country = params.get('pays') || '';
    state.nutriscore = list(params, 'nutriscore').filter((g) => /^[a-e]$/.test(g));
    state.nova = list(params, 'nova').filter((g) => /^[1-4]$/.test(g));
    state.palmFree = params.get('palme') === '0';
    state.sort = SORTS[params.get('tri')] ? params.get('tri') : 'popularity';
    const page = Number.parseInt(params.get('page') || '1', 10);
    state.page = Number.isFinite(page) ? Math.min(Math.max(page, 1), MAX_PAGE) : 1;
    return { ...state, ...preset };
}

export function serializeState(state, preset = {}) {
    const params = new URLSearchParams();
    const skip = (key) => key in preset;
    if (state.q && !skip('q')) params.set('q', state.q);
    if (state.status && !skip('status')) params.set('statut', state.status);
    state.labels.forEach((label) => params.append('label', label));
    if (state.category) params.set('categorie', state.category);
    if (state.country) params.set('pays', state.country);
    state.nutriscore.forEach((grade) => params.append('nutriscore', grade));
    state.nova.forEach((group) => params.append('nova', group));
    if (state.palmFree) params.set('palme', '0');
    if (state.sort !== 'popularity') params.set('tri', state.sort);
    if (state.page > 1) params.set('page', String(state.page));
    return params.toString();
}

export function toApiParams(state, pageSize = PAGE_SIZE) {
    return {
        q: state.q || undefined,
        is_halal: state.status === 'halal' ? '1' : undefined,
        is_excluded: state.status === 'haram' ? '1' : undefined,
        halal_status: ['doubtful', 'unknown'].includes(state.status) ? state.status : undefined,
        labels_tags: state.labels,
        categories_tags: state.category || undefined,
        countries_tags: state.country || undefined,
        nutriscore: state.nutriscore,
        nova: state.nova,
        palm_oil_free: state.palmFree ? '1' : undefined,
        sort_by: state.q ? undefined : SORTS[state.sort],
        page: state.page,
        page_size: pageSize,
    };
}

export function activeFilterCount(state) {
    return (state.status ? 1 : 0) + state.labels.length + (state.category ? 1 : 0) + (state.country ? 1 : 0)
        + state.nutriscore.length + state.nova.length + (state.palmFree ? 1 : 0);
}
