'use strict';

(function () {
    const TEAM_SLUG = 'halal-open-beauty-facts';
    const TEAM_SCOPE = 'beauty';
    const LOCAL_DATA_ENDPOINT = 'assets/data/halal-users.json';
    const TEAM_PORTAL = TEAM_SCOPE === 'beauty' ? 'beauty' : 'food';
    const ledger = window.HalalLedger || null;
    const REMOTE_ENDPOINTS = [
        `https://world.openbeautyfacts.org/team/${TEAM_SLUG}.json`,
        `https://world.openbeautyfacts.org/cgi/team.pl?action=members&team=${TEAM_SLUG}&json=1`
    ];
    const DATA_ENDPOINTS = [...REMOTE_ENDPOINTS, LOCAL_DATA_ENDPOINT];
    const CACHE_KEY = `halal-directory:${TEAM_SLUG}`;
    const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

    document.addEventListener('DOMContentLoaded', () => {
        const listContainer = document.getElementById('halal-users-list');
        const statusLabel = document.getElementById('halal-users-status');
        const counterLabel = document.getElementById('halal-user-count');
        const lastUpdateLabel = document.getElementById('halal-users-last-update');
        const searchInput = document.getElementById('halal-user-search');
        const sortSelect = document.getElementById('halal-user-sort');
        const refreshButton = document.getElementById('halal-users-refresh');

        let members = [];

        const setStatus = (message, tone = 'idle') => {
            if (!statusLabel) return;
            statusLabel.textContent = message;
            statusLabel.dataset.tone = tone;
        };

        const updateCounter = (value) => {
            if (!counterLabel) return;
            counterLabel.textContent = value.toString();
        };

        const cache = {
            read() {
                try {
                    const raw = localStorage.getItem(CACHE_KEY);
                    if (!raw) {
                        return null;
                    }
                    const parsed = JSON.parse(raw);
                    if (!parsed?.members?.length) {
                        return null;
                    }
                    if (!parsed?.stamp || (Date.now() - parsed.stamp) > CACHE_TTL_MS) {
                        localStorage.removeItem(CACHE_KEY);
                        return null;
                    }
                    return parsed;
                } catch (error) {
                    console.warn('Impossible de lire le cache Halal', error);
                    return null;
                }
            },
            write(payload) {
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
                } catch (error) {
                    console.warn('Impossible de stocker le cache Halal', error);
                }
            },
            clear() {
                try {
                    localStorage.removeItem(CACHE_KEY);
                } catch (error) {
                    console.warn('Impossible de purger le cache Halal', error);
                }
            }
        };

        const updateLastUpdate = (value) => {
            if (!lastUpdateLabel) return;
            if (!value) {
                lastUpdateLabel.textContent = '—';
                return;
            }
            const parsed = parseTimestamp(value);
            lastUpdateLabel.textContent = parsed || '—';
        };

        const parseTimestamp = (raw, options = {}) => {
            if (!raw) return '';
            if (typeof raw === 'number') {
                const normalized = raw < 10 ** 12 ? raw * 1000 : raw;
                return formatDate(new Date(normalized), options);
            }
            const timestamp = Date.parse(raw);
            if (!Number.isNaN(timestamp)) {
                return formatDate(new Date(timestamp), options);
            }
            return '';
        };

        const formatDate = (date, options = {}) => {
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
                return '';
            }
            if (options.dateOnly) {
                return date.toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit'
                });
            }
            return date.toLocaleString('fr-FR', {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        const escapeHtml = (value = '') => value.replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char] || char);

        const formatContributionLabel = (value) => {
            if (!Number.isFinite(value) || value <= 0) {
                return 'Nouvelle contributrice';
            }
            if (value === 1) {
                return '1 contribution';
            }
            return `${value} contributions`;
        };

        const filterByScope = (collection = []) => {
            if (!TEAM_SCOPE) {
                return collection;
            }
            return collection.filter((member) => {
                const scoped = Array.isArray(member.scopes)
                    ? member.scopes
                    : typeof member.scope === 'string'
                        ? [member.scope]
                        : [];
                if (!scoped.length) {
                    return true;
                }
                return scoped.includes(TEAM_SCOPE) || scoped.includes('all');
            });
        };

        const readLedgerMembers = () => {
            if (!ledger || typeof ledger.getMembers !== 'function') {
                return [];
            }
            const snapshot = ledger.getMembers(TEAM_PORTAL, { limit: 40 }) || [];
            return snapshot.map((entry) => {
                const lastSeen = entry.lastSeen || Date.now();
                const isoTimestamp = new Date(lastSeen).toISOString();
                return {
                    id: entry.id,
                    name: entry.name,
                    contributions: entry.contributions || 0,
                    lastEdit: isoTimestamp,
                    country: entry.country || 'Global',
                    scopes: entry.scopes || [TEAM_SCOPE],
                    badges: entry.badges || ['session'],
                    joinedAt: entry.joinedAt ? new Date(entry.joinedAt).toISOString() : isoTimestamp,
                    notes: entry.notes || 'Connexion via le portail Halal',
                    origin: 'session'
                };
            });
        };

        const mergeMembers = (primary = [], secondary = []) => {
            if (!secondary.length) {
                return primary;
            }
            const map = new Map();
            primary.forEach((member) => {
                if (member?.id) {
                    map.set(member.id, member);
                }
            });
            secondary.forEach((member) => {
                if (member?.id && !map.has(member.id)) {
                    map.set(member.id, member);
                }
            });
            return Array.from(map.values());
        };

        const normalizeMembers = (payload, context = {}) => {
            const buckets = [];
            const pushIfArray = (candidate) => {
                if (Array.isArray(candidate) && candidate.length) {
                    buckets.push(candidate);
                }
            };

            pushIfArray(payload?.members);
            pushIfArray(payload?.team?.members);
            pushIfArray(payload?.users);
            pushIfArray(payload?.results);

            if (!buckets.length && Array.isArray(payload)) {
                buckets.push(payload);
            }

            const merged = buckets.flat();
            const seen = new Set();

            const toArray = (value) => {
                if (Array.isArray(value)) {
                    return value.filter(Boolean).map((item) => item.toString().trim()).filter(Boolean);
                }
                if (typeof value === 'string') {
                    return value.split(',').map((item) => item.trim()).filter(Boolean);
                }
                return [];
            };

            return merged.map((entry, index) => {
                const base = entry || {};
                const nestedUser = base.user || {};
                const rawId = base.id || base.user_id || base.userid || nestedUser.id || nestedUser.user_id || base.name;
                const safeId = (rawId || `member-${index + 1}`).toString().trim();
                const displayName = (base.name || nestedUser.name || base.display_name || safeId).toString();
                const contributions = Number(base.score ?? base.products ?? base.count ?? base.total ?? base.contributions ?? 0);
                const lastEdit = base.last_edit || base.last_activity || base.last_seen || base.last_contribution || base.last_edit_time || '';
                const country = base.country || nestedUser.country || base.address_country || '';
                const scopes = base.scopes || nestedUser.scopes || base.scope;
                const badges = base.badges || base.tags || nestedUser.badges;
                const joinedAt = base.joined_at || base.joinedAt || base.created_at || base.createdAt || '';
                const notes = base.notes || base.bio || base.description || '';
                return {
                    id: safeId,
                    name: displayName,
                    contributions: Number.isNaN(contributions) ? 0 : contributions,
                    lastEdit,
                    country: country || 'Global',
                    scopes: toArray(scopes),
                    badges: toArray(badges),
                    joinedAt,
                    notes,
                    origin: context.origin || 'remote'
                };
            }).filter((member) => {
                if (!member.id) {
                    return false;
                }
                if (seen.has(member.id)) {
                    return false;
                }
                seen.add(member.id);
                return true;
            });
        };

        const renderList = (collection = []) => {
            if (!listContainer) return;
            if (!collection.length) {
                listContainer.innerHTML = '<p class="empty-state">Aucun compte halal ne correspond à votre recherche.</p>';
                return;
            }
            listContainer.innerHTML = collection.map((member, index) => {
                const safeName = escapeHtml(member.name || member.id);
                const safeId = escapeHtml(member.id);
                const contributions = formatContributionLabel(member.contributions);
                const lastAction = parseTimestamp(member.lastEdit) || 'Activité à confirmer';
                const country = escapeHtml(member.country || 'Global');
                const joinedAt = parseTimestamp(member.joinedAt, { dateOnly: true }) || '—';
                const badges = (member.badges || []).map((badge) => `<span class="halal-user-card__badge">${escapeHtml(badge)}</span>`).join('');
                const notes = member.notes ? `<p class="halal-user-card__note">${escapeHtml(member.notes)}</p>` : '';
                const originChip = member.origin === 'local'
                    ? '<span class="halal-user-card__chip">Source Halal</span>'
                    : '';
                return `
                    <article class="halal-user-card">
                        <div class="halal-user-card__header">
                            <div>
                                <p class="halal-user-card__name">${safeName}</p>
                                <small class="halal-user-card__id">@${safeId}</small>
                            </div>
                            <div class="halal-user-card__stamp">
                                <span class="halal-user-card__index">#${index + 1}</span>
                                ${originChip}
                            </div>
                        </div>
                        <div class="halal-user-card__meta">
                            <div>
                                <p class="halal-user-card__label">Contributions</p>
                                <strong>${contributions}</strong>
                            </div>
                            <div>
                                <p class="halal-user-card__label">Dernière activité</p>
                                <strong>${lastAction}</strong>
                            </div>
                            <div>
                                <p class="halal-user-card__label">Pays déclaré</p>
                                <strong>${country}</strong>
                            </div>
                            <div>
                                <p class="halal-user-card__label">Depuis</p>
                                <strong>${joinedAt}</strong>
                            </div>
                        </div>
                        ${badges ? `<div class="halal-user-card__badges">${badges}</div>` : ''}
                        ${notes}
                    </article>
                `;
            }).join('');
        };

        const applyFilters = () => {
            if (!members.length) {
                renderList([]);
                return;
            }
            const query = (searchInput?.value || '').trim().toLowerCase();
            const sortBy = (sortSelect?.value || 'recent').toLowerCase();
            let dataset = [...members];
            if (query) {
                dataset = dataset.filter((member) => {
                    return member.name.toLowerCase().includes(query) || member.id.toLowerCase().includes(query);
                });
            }
            dataset.sort((a, b) => {
                if (sortBy === 'contribs') {
                    return (b.contributions || 0) - (a.contributions || 0);
                }
                if (sortBy === 'name') {
                    return a.name.localeCompare(b.name);
                }
                const dateA = Date.parse(a.lastEdit) || 0;
                const dateB = Date.parse(b.lastEdit) || 0;
                return dateB - dateA;
            });
            renderList(dataset);
            updateCounter(dataset.length);
            if (!dataset.length) {
                setStatus('Aucun compte Halal ne correspond à cette recherche.', 'warning');
            } else {
                setStatus(`Affichage de ${dataset.length} profils Halal.`, 'success');
            }
        };

        const resolveUpdateToken = (payload) => {
            return payload?.last_modified || payload?.last_update || payload?.timestamp || payload?.generated_at || Date.now();
        };

        const seedFromCache = () => {
            const cached = cache.read();
            if (!cached) {
                return false;
            }
            members = cached.members;
            updateLastUpdate(cached.lastUpdate || cached.stamp);
            applyFilters();
            setStatus('Annuaire Halal chargé instantanément (cache).', 'success');
            return true;
        };

        const fetchMembers = async () => {
            setStatus('Synchronisation avec Open Beauty Facts...', 'pending');
            const ledgerEntries = readLedgerMembers();
            for (const endpoint of DATA_ENDPOINTS) {
                try {
                    const response = await fetch(endpoint, { credentials: 'include' });
                    if (!response.ok) {
                        continue;
                    }
                    const data = await response.json();
                    const normalized = normalizeMembers(data, {
                        origin: endpoint.startsWith('http') ? 'remote' : 'local'
                    });
                    const scoped = filterByScope(normalized);
                    if (scoped.length) {
                        members = mergeMembers(scoped, ledgerEntries);
                        const updateToken = resolveUpdateToken(data);
                        updateLastUpdate(updateToken);
                        applyFilters();
                        cache.write({
                            stamp: Date.now(),
                            lastUpdate: updateToken,
                            members: scoped
                        });
                        const label = endpoint.startsWith('http')
                            ? 'API Open Beauty Facts'
                            : 'base interne Halal';
                        setStatus(`Annuaire Halal synchronisé (${label}).`, 'success');
                        return;
                    }
                } catch (error) {
                    console.warn('Unable to load Halal team members', error);
                }
            }
            if (!members.length && ledgerEntries.length) {
                members = [...ledgerEntries];
                updateLastUpdate(ledgerEntries[0]?.lastEdit || Date.now());
                applyFilters();
                setStatus('Annuaire Halal basé sur vos connexions locales.', 'success');
                return;
            }
            if (!members.length) {
                renderList([]);
                updateCounter(0);
                setStatus('Impossible de récupérer la liste des comptes Halal. Réessayez plus tard.', 'error');
                return;
            }
            setStatus('Impossible de récupérer la liste des comptes Halal. Réessayez plus tard.', members.length ? 'warning' : 'error');
        };

        if (searchInput) {
            searchInput.addEventListener('input', () => applyFilters());
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', () => applyFilters());
        }

        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                cache.clear();
                fetchMembers();
            });
        }

        const hasWarmCache = seedFromCache();
        if (!hasWarmCache) {
            fetchMembers();
        } else {
            fetchMembers();
        }
    });
})();
