// Stockage local (listes, historique, préférences). Ne lève jamais d'exception :
// navigation privée, quota plein ou stockage désactivé → valeur par défaut.
// Les clés historiques (halal_fav, halal_cart…) sont conservées pour ne perdre aucune donnée.

export function createStore(backend = globalThis.localStorage) {
    const read = (key, fallback) => {
        try {
            const value = backend?.getItem(key);
            return value == null ? fallback : JSON.parse(value);
        } catch {
            return fallback;
        }
    };
    const write = (key, value) => {
        try { backend?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
    };
    const readRaw = (key) => { try { return backend?.getItem(key) ?? null; } catch { return null; } };
    const writeRaw = (key, value) => { try { backend?.setItem(key, value); return true; } catch { return false; } };
    return { read, write, readRaw, writeRaw };
}

export const LISTS = {
    fav: { key: 'halal_fav', label: 'Favoris', icon: 'i-star' },
    cart: { key: 'halal_cart', label: 'Liste de courses', icon: 'i-cart' },
    black: { key: 'halal_black', label: 'À éviter', icon: 'i-ban' },
};

const HISTORY_KEY = 'halal_scan_history';
const COMPARE_KEY = 'halal_compare';
const MAX_HISTORY = 100;

/** Normalise un produit stocké (anciens formats : name/brand/img). */
export function toEntry(product) {
    return {
        code: String(product.code || ''),
        name: product.product_name || product.name || '',
        brand: product.brands || product.brand || '',
        img: product.image_front_small_url || product.image_front_url || product.img || '',
        status: product.halal_status || product.status || 'unknown',
        date: product.date || new Date().toISOString(),
    };
}

export function createLists(store = createStore()) {
    const get = (list) => (store.read(LISTS[list].key, []) || []).filter((item) => item && item.code).map(toEntry);
    const has = (list, code) => get(list).some((item) => item.code === String(code));
    const toggle = (list, product) => {
        const items = get(list);
        const code = String(product.code);
        const index = items.findIndex((item) => item.code === code);
        if (index >= 0) items.splice(index, 1);
        else items.unshift(toEntry(product));
        store.write(LISTS[list].key, items);
        return index < 0;
    };
    const remove = (list, code) => store.write(LISTS[list].key, get(list).filter((item) => item.code !== String(code)));
    const clear = (list) => store.write(LISTS[list].key, []);
    const history = () => (store.read(HISTORY_KEY, []) || []).filter((item) => item && item.code).map(toEntry);
    const remember = (product) => {
        const items = history().filter((item) => item.code !== String(product.code));
        items.unshift({ ...toEntry(product), date: new Date().toISOString() });
        store.write(HISTORY_KEY, items.slice(0, MAX_HISTORY));
    };
    const compare = () => (store.read(COMPARE_KEY, []) || []).map((item) => String(item.code || item)).filter(Boolean).slice(0, 3);
    const setCompare = (codes) => store.write(COMPARE_KEY, codes.slice(0, 3).map((code) => ({ code })));
    return { get, has, toggle, remove, clear, history, remember, compare, setCompare, clearHistory: () => store.write(HISTORY_KEY, []) };
}

export const store = createStore();
export const lists = createLists(store);
