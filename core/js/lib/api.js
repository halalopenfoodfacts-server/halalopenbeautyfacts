// Client de l'API locale (/proxy/* → Django). Toutes les erreurs sont typées (ApiError.kind)
// pour que l'interface affiche un message adapté au lieu d'un « Erreur » générique.
//
// kinds : network | timeout | not-found | bad-request | rate-limit | server | computing |
//         invalid-response | aborted

export class ApiError extends Error {
    constructor(kind, message, { status = 0, retryAfter = 0, url = '' } = {}) {
        super(message);
        this.name = 'ApiError';
        this.kind = kind;
        this.status = status;
        this.retryAfter = retryAfter;
        this.url = url;
    }

    get retryable() {
        return ['network', 'timeout', 'rate-limit', 'server', 'computing'].includes(this.kind);
    }
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function kindForStatus(status) {
    if (status === 404) return 'not-found';
    if (status === 429) return 'rate-limit';
    if (status >= 500) return 'server';
    return 'bad-request';
}

function buildQuery(params = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '' || value === false) continue;
        if (Array.isArray(value)) value.filter((v) => v !== '' && v != null).forEach((v) => search.append(key, String(v)));
        else search.set(key, value === true ? '1' : String(value));
    }
    const text = search.toString();
    return text ? `?${text}` : '';
}

export function createApi({
    fetchImpl = (...args) => globalThis.fetch(...args),
    timeoutMs = 12000,
    retries = 2,
    backoffMs = 400,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
    async function once(url, signal) {
        const controller = new AbortController();
        const onAbort = () => controller.abort(signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        let response;
        try {
            response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
        } catch (error) {
            if (signal?.aborted) throw new ApiError('aborted', 'Requête annulée', { url });
            if (timedOut) throw new ApiError('timeout', 'Le serveur met trop de temps à répondre', { url });
            throw new ApiError('network', 'Connexion impossible', { url });
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }

        const type = response.headers.get('content-type') || '';
        let body = null;
        if (type.includes('json')) {
            try { body = await response.json(); } catch { body = null; }
        }
        if (!response.ok) {
            const retryAfter = Number(response.headers.get('retry-after')) || 0;
            if (response.status === 503 && body?.status === 'computing') {
                throw new ApiError('computing', 'Données en cours de calcul', { status: 503, retryAfter, url });
            }
            throw new ApiError(kindForStatus(response.status), `HTTP ${response.status}`, { status: response.status, retryAfter, url });
        }
        // Une page HTML servie en 200 (route absente du proxy) n'est pas une réponse valide
        if (!type.includes('json') || body === null) {
            throw new ApiError('invalid-response', 'Réponse inattendue du serveur', { status: response.status, url });
        }
        return body;
    }

    async function get(path, params, { signal, retry = retries } = {}) {
        const url = path + buildQuery(params);
        let attempt = 0;
        for (;;) {
            try {
                return await once(url, signal);
            } catch (error) {
                const transient = error.kind === 'network' || error.kind === 'timeout'
                    || (error.kind !== 'computing' && RETRYABLE_STATUS.has(error.status));
                if (!transient || attempt >= retry || signal?.aborted) throw error;
                attempt += 1;
                await sleep(backoffMs * 2 ** (attempt - 1));
            }
        }
    }

    return {
        get,
        search: (params, options) => get('/proxy/v2/search', params, options),
        product: (code, options) => get(`/proxy/v2/product/${encodeURIComponent(code)}.json`, undefined, options),
        stats: (options) => get('/proxy/stats', undefined, { retry: 1, ...options }),
        facet: (type, options) => get(`/proxy/facets/${encodeURIComponent(type)}.json`, undefined, { retry: 1, ...options }),
        top: (pageSize = 12, options) => get('/proxy/top', { page_size: pageSize }, options),
        recent: (pageSize = 12, options) => get('/proxy/recent', { page_size: pageSize }, options),
    };
}

/** Message utilisateur pour une erreur d'API (clé i18n + texte FR de repli). */
export function describeError(error) {
    switch (error?.kind) {
        case 'network': return { key: 'error.network', text: 'Pas de connexion. Vérifiez votre réseau puis réessayez.' };
        case 'timeout': return { key: 'error.timeout', text: 'Le serveur met trop de temps à répondre. Réessayez dans un instant.' };
        case 'not-found': return { key: 'error.notFound', text: 'Élément introuvable.' };
        case 'rate-limit': return { key: 'error.rateLimit', text: 'Trop de requêtes. Patientez quelques secondes.' };
        case 'computing': return { key: 'error.computing', text: 'Les statistiques sont en cours de calcul. Elles seront disponibles dans quelques minutes.' };
        case 'bad-request': return { key: 'error.badRequest', text: 'La demande est invalide.' };
        default: return { key: 'error.server', text: 'Le service est momentanément indisponible. Réessayez plus tard.' };
    }
}

export const api = createApi();
