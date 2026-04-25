'use strict';

(function () {
    const STORAGE_KEY = 'halal-members-ledger';
    const STORAGE_VERSION = 1;
    const STORAGE_LIMIT = 80;

    const hasLocalStorage = () => {
        try {
            return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
        } catch (error) {
            console.warn('HalalLedger: localStorage unavailable', error);
            return false;
        }
    };

    const inferPortal = () => {
        const docPortal = document?.documentElement?.dataset?.portal;
        if (docPortal) {
            return docPortal.toLowerCase();
        }
        const path = (window?.location?.pathname || '').toLowerCase();
        if (path.includes('/beauty/')) {
            return 'beauty';
        }
        if (path.includes('/food/')) {
            return 'food';
        }
        const host = (window?.location?.hostname || '').toLowerCase();
        if (host.includes('beauty')) {
            return 'beauty';
        }
        if (host.includes('food')) {
            return 'food';
        }
        return 'food';
    };

    const readStore = () => {
        if (!hasLocalStorage()) {
            return { version: STORAGE_VERSION, entries: [] };
        }
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return { version: STORAGE_VERSION, entries: [] };
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed?.entries)) {
                return { version: STORAGE_VERSION, entries: [] };
            }
            return {
                version: parsed.version || STORAGE_VERSION,
                entries: parsed.entries
            };
        } catch (error) {
            console.warn('HalalLedger: unable to parse store', error);
            return { version: STORAGE_VERSION, entries: [] };
        }
    };

    const writeStore = (payload) => {
        if (!hasLocalStorage()) {
            return;
        }
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (error) {
            console.warn('HalalLedger: unable to persist store', error);
        }
    };

    const normalizeMember = (input = {}) => {
        const safeId = (input.id || input.username || '').toString().trim();
        if (!safeId) {
            return null;
        }
        const portal = (input.portal || inferPortal()).toLowerCase();
        const timestamp = input.lastSeen || input.joinedAt || Date.now();
        return {
            id: safeId,
            name: (input.name || safeId).toString().trim(),
            portal,
            scopes: Array.isArray(input.scopes) && input.scopes.length
                ? input.scopes
                : [portal],
            badges: Array.isArray(input.badges) && input.badges.length
                ? input.badges
                : [input.source === 'signup' ? 'signup' : 'session'],
            country: input.country || input.countryLabel || '',
            notes: input.notes || '',
            lastSeen: timestamp,
            joinedAt: input.joinedAt || timestamp,
            source: input.source || 'session'
        };
    };

    const upsertEntry = (entries, candidate) => {
        const next = entries.filter((entry) => !(entry.id === candidate.id && entry.portal === candidate.portal));
        next.unshift(candidate);
        return next.slice(0, STORAGE_LIMIT);
    };

    const recordMember = (input = {}) => {
        const normalized = normalizeMember(input);
        if (!normalized) {
            return null;
        }
        const store = readStore();
        store.entries = upsertEntry(store.entries || [], normalized);
        writeStore(store);
        return normalized;
    };

    const getMembers = (portalFilter, options = {}) => {
        const store = readStore();
        let entries = store.entries || [];
        if (portalFilter) {
            entries = entries.filter((entry) => entry.portal === portalFilter);
        }
        entries.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
        const limit = Number(options.limit);
        if (limit && Number.isFinite(limit)) {
            return entries.slice(0, Math.max(1, limit));
        }
        return entries;
    };

    const clear = () => {
        if (!hasLocalStorage()) return;
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.warn('HalalLedger: unable to clear store', error);
        }
    };

    window.HalalLedger = Object.freeze({
        recordMember,
        getMembers,
        clear,
        storageKey: STORAGE_KEY,
        inferPortal
    });
})();
