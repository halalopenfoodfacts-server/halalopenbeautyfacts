import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createApi, describeError } from '../../js/lib/api.js';

function response(status, body, { type = 'application/json', headers = {} } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name) => ({ 'content-type': type, ...headers })[name.toLowerCase()] ?? null },
        json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    };
}

function fakeFetch(...responses) {
    const calls = [];
    const fn = async (url) => {
        calls.push(url);
        const next = responses.shift();
        if (next instanceof Error) throw next;
        return next;
    };
    fn.calls = calls;
    return fn;
}

const noSleep = () => Promise.resolve();

test('succès et construction de la requête', async () => {
    const fetchImpl = fakeFetch(response(200, { products: [], count: 0 }));
    const api = createApi({ fetchImpl, sleep: noSleep });
    await api.search({ q: 'lait', labels_tags: ['en:a', 'en:b'], empty: '', no: false, page: 2 });
    assert.equal(fetchImpl.calls[0], '/proxy/v2/search?q=lait&labels_tags=en%3Aa&labels_tags=en%3Ab&page=2');
});

test('404 → not-found, sans nouvelle tentative', async () => {
    const fetchImpl = fakeFetch(response(404, { status: 0 }));
    const api = createApi({ fetchImpl, sleep: noSleep });
    await assert.rejects(api.product('000'), (error) => error instanceof ApiError && error.kind === 'not-found');
    assert.equal(fetchImpl.calls.length, 1);
});

test('page HTML servie en 200 → invalid-response (avant : « Invalid API response » silencieux)', async () => {
    const api = createApi({ fetchImpl: fakeFetch(response(200, '<!doctype html>', { type: 'text/html' })), sleep: noSleep });
    await assert.rejects(api.stats(), { kind: 'invalid-response' });
});

test('erreurs transitoires : nouvelles tentatives puis succès', async () => {
    const fetchImpl = fakeFetch(new TypeError('Failed to fetch'), response(502, null, { type: 'text/html' }), response(200, { ok: 1 }));
    const api = createApi({ fetchImpl, sleep: noSleep, retries: 2 });
    assert.deepEqual(await api.get('/proxy/x'), { ok: 1 });
    assert.equal(fetchImpl.calls.length, 3);
});

test('erreurs transitoires persistantes → kind exploitable', async () => {
    const api = createApi({ fetchImpl: fakeFetch(new TypeError('x'), new TypeError('x'), new TypeError('x')), sleep: noSleep });
    await assert.rejects(api.get('/proxy/x'), { kind: 'network' });
    const api500 = createApi({ fetchImpl: fakeFetch(response(500, { e: 1 })), sleep: noSleep });
    await assert.rejects(api500.get('/proxy/x'), { kind: 'server' });
});

test('503 « computing » des stats : pas de martèlement, Retry-After transmis', async () => {
    const fetchImpl = fakeFetch(response(503, { status: 'computing' }, { headers: { 'retry-after': '120' } }));
    const api = createApi({ fetchImpl, sleep: noSleep });
    await assert.rejects(api.stats(), (error) => error.kind === 'computing' && error.retryAfter === 120);
    assert.equal(fetchImpl.calls.length, 1);
});

test('délai dépassé → timeout ; annulation → aborted', async () => {
    const hanging = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('a', 'AbortError'))));
    const api = createApi({ fetchImpl: hanging, timeoutMs: 20, retries: 0, sleep: noSleep });
    await assert.rejects(api.get('/proxy/x'), { kind: 'timeout' });
    const controller = new AbortController();
    const pending = api.get('/proxy/x', undefined, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { kind: 'aborted' });
});

test('messages utilisateur', () => {
    assert.equal(describeError(new ApiError('network', '')).key, 'error.network');
    assert.equal(describeError({}).key, 'error.server');
});
