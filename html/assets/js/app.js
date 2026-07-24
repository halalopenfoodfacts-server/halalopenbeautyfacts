// ── Sécurité : encodage HTML pour prévenir le XSS ──────────
function esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/`/g, '&#x60;');
}
// ── Sanitisation des barcodes (chiffres uniquement) ──────────
function sanitizeBarcode(code) {
    if (!code) return '';
    return String(code).replace(/[^0-9A-Za-z_-]/g, '');
}

// Main application logic
console.log('=== APP.JS LOADED ===');

document.addEventListener('DOMContentLoaded', () => {
    console.log('=== DOM CONTENT LOADED ===');
    
    const productGrid = document.getElementById('product-grid');
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input');
    const paginationContainer = document.getElementById('pagination');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const categorySelect = document.getElementById('category-select');
    const sortSelect = document.getElementById('sort-select');
    const productCountDisplay = document.getElementById('product-count');
    const halalCountDisplay = document.getElementById('halal-count');
    const contributorsCountDisplay = document.getElementById('contributors-count');
    const countryCountDisplay = document.getElementById('country-count');
    const barcodeButton = document.getElementById('barcode-button');
    const barcodeOverlay = document.getElementById('barcode-overlay');
    const barcodeVideo = document.getElementById('barcode-video');
    const barcodeCancelButton = document.getElementById('barcode-cancel');
    const barcodeManualPrompt = document.getElementById('barcode-manual-prompt');
    const liveFeedContainer = document.getElementById('live-feed-list');
    const liveFeedRefresh = document.getElementById('refresh-live-feed');
    const liveFeedLoadingText = document.getElementById('live-feed-loading-text');
    const liveFeedEmptyText = document.getElementById('live-feed-empty-text');
    const countryContext = document.getElementById('country-context');
    const countryChip = document.getElementById('country-chip');
    const countryMessage = document.getElementById('country-message');
    const accountWidget = document.getElementById('account-widget');
    const accountStatusLabel = document.getElementById('account-status');
    const accountHintLabel = document.getElementById('account-hint');
    const accountPrimaryAction = document.getElementById('account-action-primary');
    const accountSecondaryAction = document.getElementById('account-action-secondary');
    const welcomeBanner = document.getElementById('welcome-banner');
    const welcomeTitle = document.getElementById('welcome-title');
    const welcomeMessage = document.getElementById('welcome-message');
    const welcomeDismiss = document.getElementById('welcome-dismiss');
    const userGreeting = document.getElementById('user-greeting');
    const userGreetingName = document.getElementById('user-greeting-name');
    const accountChip = document.getElementById('account-chip');
    const accountChipName = document.getElementById('account-chip-name');
    const accountChipAvatar = document.getElementById('account-chip-avatar');
    const advancedToggleButton = document.getElementById('advanced-filter-toggle');
    const advancedPanel = document.getElementById('advanced-filter-panel');
    const advancedIndicator = document.getElementById('advanced-filter-indicator');
    const advancedResetButton = document.getElementById('advanced-filter-reset');
    const advancedApplyButton = document.getElementById('advanced-filter-apply');
    const advancedChips = document.querySelectorAll('[data-advanced-filter]');
    const palmOilToggle = document.getElementById('advanced-palm-toggle');
    const apiLiveSection = document.getElementById('api-live');
    const apiLiveRefreshButton = document.getElementById('api-live-refresh');
    const apiLiveCards = {
        catalogue: prepareApiLiveCard('catalogue'),
        stats: prepareApiLiveCard('stats'),
        live: prepareApiLiveCard('live')
    };

    console.log('Elements found:', {
        productGrid: !!productGrid,
        searchButton: !!searchButton,
        searchInput: !!searchInput,
        paginationContainer: !!paginationContainer
    });

    if (!productGrid) {
        console.error('CRITICAL ERROR: product-grid element not found!');
        return;
    }

    const API_DOMAIN = 'https://world.openbeautyfacts.org';
    const SEARCH_API_URL = '/proxy/search/search';
    const CATALOGUE_API_URL = '/proxy/v2/search';
    const SESSION_ENDPOINT = `${API_DOMAIN}/cgi/session.pl?json=1`;
    const ACCOUNT_CREATE_URL = `${API_DOMAIN}/cgi/user.pl`;
    const ACCOUNT_LOGOUT_URL = `${API_DOMAIN}/cgi/logout.pl`;
    const LOCAL_SIGNUP_PAGE = 'signup.html';
    const CONTRIBUTOR_BASE_URL = `${API_DOMAIN}/contributor/`;
    const CONTRIBUTORS_FACET_ENDPOINT = '/proxy/facets/contributors.json';
    const AUTH_WELCOME_KEY = 'halal-auth-welcome';
    const PORTAL_ID = API_DOMAIN.includes('openbeautyfacts') ? 'beauty' : 'food';
    const AUTH_INTENT_TTL = 10 * 60 * 1000;
    const AUTH_RETRY_MAX = 6;
    const AUTH_RETRY_DELAY = 2000;
    const PAGE_SIZE = 50;
    const LIVE_FEED_LIMIT = 6;
    const DEFAULT_PRODUCT_IMAGE = 'https://static.openfoodfacts.org/images/misc/product-default.png';
    const numberFormatter = new Intl.NumberFormat('fr-FR');
    const CACHE_KEY_PRODUCTS = 'halal-beauty-products-cache';
    const CACHE_KEY_TIMESTAMP = 'halal-beauty-cache-timestamp';
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 heures
    const RETRY_INTERVAL = 30000; // 30 secondes
    const FALLBACK_STATS = {
        products: 64237,
        contributors: 3424,
        countries: 867
    };
    const NOVA_TAG_MAP = {
        '1': 'en:1-unprocessed-or-minimally-processed-foods',
        '2': 'en:2-processed-culinary-ingredients',
        '3': 'en:3-processed-foods',
        '4': 'en:4-ultra-processed-food-and-drink-products'
    };
    
    let currentPage = 1;
    let currentFilters = {
        search: '',
        tags: [],
        category: '',
        sort: 'popularity',
        country: '',
        halalOnly: false,
        advanced: createEmptyAdvancedFilters()
    };
    let recentLiveFeedProducts = [];
    let liveFeedAbortController;
    let barcodeDetector;
    let barcodeStream;
    let barcodeScanFrame;
    let barcodeScannerActive = false;
    let cachedAuthIntent;
    let authRetryTimer = null;
    let authRetryAttempts = 0;
    let retryTimer = null;
    let apiIsDown = false;

    // Cache functions
    function saveProductsToCache(products) {
        try {
            localStorage.setItem(CACHE_KEY_PRODUCTS, JSON.stringify(products));
            localStorage.setItem(CACHE_KEY_TIMESTAMP, Date.now().toString());
        } catch (error) {
            console.warn('Failed to save to cache:', error);
        }
    }

    function loadProductsFromCache() {
        try {
            const cached = localStorage.getItem(CACHE_KEY_PRODUCTS);
            const timestamp = localStorage.getItem(CACHE_KEY_TIMESTAMP);
            if (!cached || !timestamp) return null;
            
            const age = Date.now() - parseInt(timestamp);
            if (age > CACHE_DURATION) {
                clearProductsCache();
                return null;
            }
            
            return JSON.parse(cached);
        } catch (error) {
            console.warn('Failed to load from cache:', error);
            return null;
        }
    }

    function clearProductsCache() {
        try {
            localStorage.removeItem(CACHE_KEY_PRODUCTS);
            localStorage.removeItem(CACHE_KEY_TIMESTAMP);
        } catch (error) {
            console.warn('Failed to clear cache:', error);
        }
    }

    function startAutoRetry() {
        if (retryTimer) return;
        retryTimer = setInterval(() => {
            if (apiIsDown) {
                console.log('[Auto-retry] Tentative de reconnexion...');
                fetchProducts(currentPage);
            }
        }, RETRY_INTERVAL);
    }

    function stopAutoRetry() {
        if (retryTimer) {
            clearInterval(retryTimer);
            retryTimer = null;
        }
    }

    function showApiDownNotification() {
        const notification = document.createElement('div');
        notification.id = 'api-down-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff6600;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(255,102,0,0.3);
            z-index: 10000;
            font-family: sans-serif;
            font-size: 14px;
            max-width: 400px;
        `;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 24px;">🔌</span>
                <div>
                    <strong>API temporairement indisponible</strong>
                    <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">Nouvelle tentative dans 30 secondes...</p>
                </div>
            </div>
        `;
        
        const existing = document.getElementById('api-down-notification');
        if (existing) existing.remove();
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }

    function showApiRestoredNotification() {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #1f9a5f;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(31,154,95,0.3);
            z-index: 10000;
            font-family: sans-serif;
            font-size: 14px;
        `;
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 24px;">✅</span>
                <strong>Connexion rétablie !</strong>
            </div>
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    // Fetch and display products
    async function fetchProducts(page = 1) {
        productGrid.innerHTML = '<p style="text-align: center; padding: 2rem;">Chargement des produits...</p>';
        
        console.log('=== FETCH PRODUCTS DEBUG ===');
        console.log('Fetching products for page:', page);
        console.log('Current filters:', currentFilters);
        console.log('Current filters.country:', currentFilters.country);
        console.log('Country filter active:', !!currentFilters.country);
        const requestStartedAt = performance.now();
        setApiLiveState('catalogue', 'pending');
        
        try {
            const params = new URLSearchParams({
                search_simple: 1,
                action: 'process',
                search_terms: currentFilters.search,
                page_size: PAGE_SIZE,
                page: page,
                json: 1
            });

            // Add filter tags
            let tagIndex = 1;
            currentFilters.tags.forEach(tag => {
                params.append(`tagtype_${tagIndex}`, 'labels');
                params.append(`tag_contains_${tagIndex}`, 'contains');
                params.append(`tag_${tagIndex}`, tag);
                tagIndex += 1;
            });

            if (currentFilters.category) {
                params.append(`tagtype_${tagIndex}`, 'categories');
                params.append(`tag_contains_${tagIndex}`, 'contains');
                params.append(`tag_${tagIndex}`, currentFilters.category);
                tagIndex += 1;
            }

            if (currentFilters.country) {
                params.append(`tagtype_${tagIndex}`, 'countries');
                params.append(`tag_contains_${tagIndex}`, 'contains');
                params.append(`tag_${tagIndex}`, `en:${currentFilters.country}`);
                tagIndex += 1;
            }

            tagIndex = appendAdvancedFilters(params, tagIndex);

            // Filtre halal certifié uniquement
            if (currentFilters.halalOnly) {
                params.append('is_halal', '1');
            }

            // Add sorting
            if (currentFilters.sort) {
                if (currentFilters.sort === 'popularity') {
                    params.append('sort_by', 'unique_scans_n');
                } else {
                    params.append('sort_by', currentFilters.sort);
                }
            }

            const url = `${CATALOGUE_API_URL}?${params.toString()}`;
            console.log('Fetching from URL:', url);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await parseApiJsonResponse(response, 'Catalogue');
            console.log('Received data:', data);
            console.log('Number of products:', data.products ? data.products.length : 0);
            
            // Succès - sauvegarder dans le cache
            if (data.products && data.products.length > 0) {
                saveProductsToCache(data.products);
            }
            
            // Si l'API était en panne et qu'elle fonctionne maintenant
            if (apiIsDown) {
                apiIsDown = false;
                stopAutoRetry();
                showApiRestoredNotification();
            }
            
            displayProducts(data.products || []);
            displayPagination(page, data.count || 0);
            currentPage = page;
            setApiLiveState('catalogue', 'ok', {
                duration: performance.now() - requestStartedAt,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error("Could not fetch products:", error);
            const isApiDown = error.message.includes('temporairement indisponible') || error.message.includes('temporarily unavailable') || error.message.includes('HTML');
            
            if (isApiDown && !apiIsDown) {
                apiIsDown = true;
                showApiDownNotification();
                startAutoRetry();
            }
            
            // Essayer de charger depuis le cache
            const cachedProducts = loadProductsFromCache();
            if (cachedProducts && cachedProducts.length > 0) {
                const cacheTimestamp = localStorage.getItem(CACHE_KEY_TIMESTAMP);
                const cacheAge = cacheTimestamp ? Math.round((Date.now() - parseInt(cacheTimestamp)) / 3600000) : 0;
                
                productGrid.innerHTML = `
                    <div style="text-align: center; padding: 2rem; background: #fff3cd; border-radius: 8px; margin-bottom: 2rem;">
                        <p style="color: #856404; font-weight: 600; margin-bottom: 0.5rem;">⚠️ Affichage des données en cache (${cacheAge}h)</p>
                        <p style="color: #856404; font-size: 0.9rem;">L'API est temporairement indisponible. Reconnexion automatique en cours...</p>
                    </div>
                `;
                displayProducts(cachedProducts);
                displayPagination(page, cachedProducts.length);
            } else {
                const errorHtml = isApiDown
                    ? `<div style="text-align: center; padding: 3rem; max-width: 600px; margin: 0 auto;">
                        <p style="font-size: 3rem; margin-bottom: 1rem;">🔌</p>
                        <p style="color: #ff6600; font-weight: 600; margin-bottom: 1rem; font-size: 1.3rem;">L'API Open Beauty Facts est temporairement indisponible</p>
                        <p style="color: #666; margin-bottom: 1rem; line-height: 1.6;">Le service externe <strong>world.openbeautyfacts.org</strong> est actuellement en maintenance ou surchargé.</p>
                        <p style="color: #1f9a5f; margin-bottom: 1rem; font-size: 0.95rem; font-weight: 600;">🔄 Reconnexion automatique toutes les 30 secondes</p>
                        <p style="color: #888; margin-bottom: 2rem; font-size: 0.9rem;">Cette interruption est temporaire et indépendante de notre plateforme.</p>
                        <button onclick="location.reload()" style="background: #ff6600; color: white; border: none; padding: 14px 28px; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: 600; box-shadow: 0 2px 8px rgba(255,102,0,0.3);">🔄 Réessayer maintenant</button>
                        <p style="color: #999; margin-top: 1.5rem; font-size: 0.85rem;">Ou visitez <a href="https://world.openbeautyfacts.org" target="_blank" style="color: #ff6600;">world.openbeautyfacts.org</a> pour vérifier l'état du service</p>
                      </div>`
                    : '<p style="text-align: center; padding: 2rem; color: red;">Impossible de charger les produits. Merci de réessayer.</p>';
                productGrid.innerHTML = errorHtml;
            }
            
            setApiLiveState('catalogue', 'error', { message: error.message });
        }
    }

    function formatStatValue(value, fallback) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return fallback || '—';
        }
        return numberFormatter.format(Math.round(value));
    }

    async function parseApiJsonResponse(response, contextLabel = 'API request') {
        const rawText = await response.text();
        try {
            return JSON.parse(rawText);
        } catch (error) {
            // Détecter si c'est une page HTML d'erreur (API en panne)
            if (rawText.includes('<!DOCTYPE html>') || rawText.includes('<html')) {
                throw new Error(`${contextLabel}: L'API Open Beauty Facts est temporairement indisponible. Veuillez réessayer dans quelques instants.`);
            }
            const snippet = rawText.slice(0, 140).replace(/\s+/g, ' ').trim();
            throw new Error(`${contextLabel}: réponse JSON invalide (${response.status}) ${snippet}`);
        }
    }

    function appendAdvancedFilters(params, startIndex = 1) {
        const advanced = currentFilters?.advanced;
        if (!advanced) return startIndex;

        let tagIndex = startIndex;

        const addTagFilter = (type, value) => {
            if (!value) return;
            params.append(`tagtype_${tagIndex}`, type);
            params.append(`tag_contains_${tagIndex}`, 'contains');
            params.append(`tag_${tagIndex}`, value);
            tagIndex += 1;
        };

        (advanced.labels || []).forEach(label => addTagFilter('labels', label));

        (advanced.nutri || []).forEach(grade => {
            const normalized = (grade || '').toString().toLowerCase();
            if (!normalized) return;
            addTagFilter('nutrition-grades', `en:${normalized}`);
        });

        (advanced.nova || []).forEach(group => {
            const slug = NOVA_TAG_MAP[group];
            if (slug) {
                addTagFilter('nova-groups', slug);
            }
        });

        if (advanced.palmOilFree) {
            params.append('ingredients_from_palm_oil', '0');
            params.append('ingredients_that_may_be_from_palm_oil', '0');
        }

        return tagIndex;
    }

    function createEmptyAdvancedFilters() {
        return {
            nutri: [],
            nova: [],
            labels: [],
            palmOilFree: false
        };
    }

    async function fetchInventoryCount(country = '') {
        // Utiliser /proxy/stats qui retourne les vrais totaux de notre base locale
        const url = country
            ? `/proxy/v2/search?page_size=1&fields=code&tagtype_1=countries&tag_contains_1=contains&tag_1=en:${encodeURIComponent(country)}`
            : '/proxy/stats';

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Stats request failed with status ${response.status}`);
        }

        const data = await parseApiJsonResponse(response, 'Stats inventaire');
        // /proxy/stats retourne { total: N }, /proxy/v2/search retourne { count: N }
        return typeof data.total === 'number' ? data.total :
               typeof data.count === 'number' ? data.count : null;
    }

    async function hydrateStats(selectedCountry = '') {
        if (!productCountDisplay && !contributorsCountDisplay && !countryCountDisplay) return;

        const statsStartedAt = performance.now();
        setApiLiveState('stats', 'pending');

        try {
            const [inventoryCount, contributorsResponse, statsResponse] = await Promise.all([
                fetchInventoryCount(selectedCountry),
                fetch(CONTRIBUTORS_FACET_ENDPOINT),
                fetch('/proxy/stats')
            ]);

            if (productCountDisplay && typeof inventoryCount === 'number') {
                productCountDisplay.textContent = formatStatValue(inventoryCount, productCountDisplay.dataset.fallback);
            }

            // Compteur produits halal et exclus
            if (statsResponse.ok) {
                try {
                    const statsData = await statsResponse.json();
                    const excludedEl = document.getElementById('excluded-count');
                    if (excludedEl) excludedEl.textContent = formatStatValue(statsData.excluded || 0);
                    if (halalCountDisplay) halalCountDisplay.textContent = formatStatValue(statsData.halal || 0);
                } catch(e) {}
            }

            if (contributorsCountDisplay) {
                // Toujours afficher la valeur de fallback
                contributorsCountDisplay.textContent = formatStatValue(FALLBACK_STATS.contributors);
            }

            if (countryCountDisplay) {
                countryCountDisplay.textContent = selectedCountry
                    ? '1'
                    : (countryCountDisplay.dataset.fallback || '180');
            }
            setApiLiveState('stats', 'ok', {
                duration: performance.now() - statsStartedAt,
                timestamp: Date.now()
            });

        } catch (error) {
            console.warn('Stats hydration failed; falling back to defaults', error);
            if (productCountDisplay) {
                productCountDisplay.textContent = formatStatValue(FALLBACK_STATS.products);
            }
            if (contributorsCountDisplay) {
                contributorsCountDisplay.textContent = formatStatValue(FALLBACK_STATS.contributors);
            }
            if (countryCountDisplay) {
                countryCountDisplay.textContent = selectedCountry
                    ? '1'
                    : FALLBACK_STATS.countries.toString();
            }
            setApiLiveState('stats', 'error', { message: error.message });
        }
    }

    function syncCountryContextCopies() {
        if (countryChip) {
            countryChip.dataset.global = countryChip.textContent.trim();
        }
        if (countryMessage) {
            countryMessage.dataset.global = countryMessage.textContent.trim();
        }
    }

    function updateCountryContextUI(countryLabel = '') {
        if (!countryChip || !countryMessage) {
            return;
        }

        const trimmed = (countryLabel || '').trim();
        const isGlobal = !trimmed.length;
        const chipGlobal = countryChip.dataset.global || countryChip.textContent;
        countryChip.textContent = isGlobal ? (chipGlobal || '🌍') : trimmed;

        const template = countryMessage.dataset.template || '';
        if (isGlobal) {
            countryMessage.textContent = countryMessage.dataset.global || countryMessage.textContent;
        } else if (template.includes('%COUNTRY%')) {
            countryMessage.textContent = template.replace(/%COUNTRY%/g, trimmed);
        } else {
            countryMessage.textContent = trimmed;
        }

        if (countryContext) {
            countryContext.classList.toggle('hero__locale--active', !isGlobal);
        }
    }

    function ensureAdvancedFiltersState() {
        if (!currentFilters.advanced) {
            currentFilters.advanced = createEmptyAdvancedFilters();
        }
        return currentFilters.advanced;
    }

    function normalizeAdvancedGroup(rawKey = '') {
        const key = rawKey.toLowerCase();
        if (key === 'label') {
            return 'labels';
        }
        if (key === 'nutriscore') {
            return 'nutri';
        }
        return key;
    }

    function getAdvancedActiveCount() {
        const advanced = ensureAdvancedFiltersState();
        const chips = (advanced.nutri?.length || 0)
            + (advanced.nova?.length || 0)
            + (advanced.labels?.length || 0);
        return chips + (advanced.palmOilFree ? 1 : 0);
    }

    function updateAdvancedIndicator() {
        if (!advancedIndicator) return;
        const activeCount = getAdvancedActiveCount();
        const suffix = activeCount > 1 ? 'actifs' : 'actif';
        advancedIndicator.textContent = `${activeCount} ${suffix}`;
        advancedIndicator.dataset.count = String(activeCount);
        if (advancedToggleButton) {
            advancedToggleButton.classList.toggle('has-active-filters', activeCount > 0);
        }
    }

    function setAdvancedPanelVisibility(forceState) {
        if (!advancedPanel) return;
        const shouldShow = typeof forceState === 'boolean'
            ? forceState
            : advancedPanel.hasAttribute('hidden');
        if (shouldShow) {
            advancedPanel.removeAttribute('hidden');
        } else {
            advancedPanel.setAttribute('hidden', '');
        }
        if (advancedToggleButton) {
            advancedToggleButton.setAttribute('aria-expanded', shouldShow ? 'true' : 'false');
        }
    }

    function handleAdvancedChipSelection(chip) {
        if (!chip) return;
        const advanced = ensureAdvancedFiltersState();
        const group = normalizeAdvancedGroup(chip.dataset.advancedFilter || '');
        const value = chip.dataset.value;
        if (!group || !value || !Array.isArray(advanced[group])) {
            return;
        }

        const existingIndex = advanced[group].indexOf(value);
        if (existingIndex > -1) {
            advanced[group] = advanced[group].filter(item => item !== value);
            chip.classList.remove('is-active');
        } else {
            advanced[group] = [...advanced[group], value];
            chip.classList.add('is-active');
        }

        updateAdvancedIndicator();
        currentPage = 1;
        fetchProducts(currentPage);
    }

    function handlePalmOilToggle(isChecked) {
        const advanced = ensureAdvancedFiltersState();
        advanced.palmOilFree = Boolean(isChecked);
        updateAdvancedIndicator();
        currentPage = 1;
        fetchProducts(currentPage);
    }

    function resetAdvancedFilters() {
        currentFilters.advanced = createEmptyAdvancedFilters();
        if (advancedChips && advancedChips.length) {
            advancedChips.forEach(chip => chip.classList.remove('is-active'));
        }
        if (palmOilToggle) {
            palmOilToggle.checked = false;
        }
        updateAdvancedIndicator();
        currentPage = 1;
        fetchProducts(currentPage);
        setAdvancedPanelVisibility(false);
    }

    function applyAdvancedFiltersAndFetch() {
        currentPage = 1;
        fetchProducts(currentPage);
        setAdvancedPanelVisibility(false);
    }

    // Display products in grid
    function displayProducts(products) {
        productGrid.innerHTML = '';
        
        if (!products || products.length === 0) {
            productGrid.innerHTML = '<p style="text-align: center; padding: 2rem;">Aucun produit trouvé pour ces filtres.</p>';
            return;
        }

        // Utiliser DocumentFragment pour affichage plus rapide
        const fragment = document.createDocumentFragment();

        products.forEach(product => {
            const productName = product.product_name || 'Unknown Product';
            const brand = product.brands || 'Unknown Brand';
            const imageUrl = product.image_front_small_url || product.image_front_url || DEFAULT_PRODUCT_IMAGE;
            const barcode = product.code || '';

            const productCard = document.createElement('div');
            productCard.className = 'product-card';
            productCard.innerHTML = `
                <img src="${imageUrl}" alt="${productName}" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_PRODUCT_IMAGE}';">
                <div class="product-info">
                    <h3>${esc(productName)}</h3>
                    <p>${esc(brand)}</p>
                </div>
            `;
            
            productCard.addEventListener('click', () => {
                window.location.href = `product.html?code=${sanitizeBarcode(barcode)}`;
            });
            
            fragment.appendChild(productCard);
        });

        // Ajouter tout d'un coup pour affichage plus rapide
        productGrid.appendChild(fragment);
    }

    function formatRelativeTime(timestamp) {
        if (!timestamp) {
            return '';
        }
        const date = new Date(Number(timestamp) * 1000);
        if (Number.isNaN(date.getTime())) {
            return '';
        }

        const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
        const absSeconds = Math.abs(diffSeconds);
        const ranges = [
            { limit: 60, divisor: 1, unit: 'second' },
            { limit: 3600, divisor: 60, unit: 'minute' },
            { limit: 86400, divisor: 3600, unit: 'hour' },
            { limit: 604800, divisor: 86400, unit: 'day' },
            { limit: 2592000, divisor: 604800, unit: 'week' },
            { limit: 31536000, divisor: 2592000, unit: 'month' },
            { limit: Infinity, divisor: 31536000, unit: 'year' }
        ];

        const locale = document.documentElement.lang || 'fr';

        try {
            const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
            for (const range of ranges) {
                if (absSeconds < range.limit) {
                    const value = Math.trunc(diffSeconds / range.divisor) || 0;
                    return formatter.format(value, range.unit);
                }
            }
        } catch (error) {
            console.warn('Relative time formatting fallback', error);
        }

        return date.toLocaleDateString(locale);
    }

    function getLiveFeedMessage(type) {
        if (type === 'loading') {
            return (liveFeedLoadingText?.textContent || 'Chargement du flux...').trim();
        }
        return (liveFeedEmptyText?.textContent || 'Aucune contribution récente.').trim();
    }

    function renderLiveFeed(products = []) {
        if (!liveFeedContainer) return;

        if (!products.length) {
            liveFeedContainer.innerHTML = `<div class="live-feed__placeholder">${getLiveFeedMessage('empty')}</div>`;
            return;
        }

        liveFeedContainer.innerHTML = '';
        const limit = Math.min(products.length, LIVE_FEED_LIMIT);

        for (let i = 0; i < limit; i += 1) {
            const product = products[i];
            const productName = product.product_name || 'Produit halal';
            const brandName = product.brands ? product.brands.split(',')[0].trim() : '';
            const imageUrl = product.image_front_small_url || DEFAULT_PRODUCT_IMAGE;
            const code = product.code;

            const item = document.createElement('article');
            item.className = 'live-feed__item';
            item.tabIndex = 0;

            const image = document.createElement('img');
            image.src = imageUrl;
            image.alt = productName;
            image.loading = 'lazy';

            const meta = document.createElement('div');
            meta.className = 'live-feed__meta';

            const title = document.createElement('p');
            title.className = 'live-feed__title';
            title.textContent = productName;

            const brand = document.createElement('p');
            brand.className = 'live-feed__brand';
            brand.textContent = brandName || '—';

            const time = document.createElement('p');
            time.className = 'live-feed__time';
            const relativeTime = formatRelativeTime(product.last_modified_t);
            time.textContent = relativeTime || '';

            meta.appendChild(title);
            meta.appendChild(brand);
            meta.appendChild(time);

            const cta = document.createElement('a');
            cta.className = 'live-feed__cta';
            if (code) {
                cta.href = `product.html?code=${code}`;
                cta.setAttribute('aria-label', productName);
                cta.title = productName;
            } else {
                cta.setAttribute('aria-hidden', 'true');
                cta.tabIndex = -1;
            }
            cta.textContent = '→';

            const navigateToProduct = () => {
                if (!code) return;
                window.location.href = `product.html?code=${sanitizeBarcode(code)}`;
            };

            item.addEventListener('click', navigateToProduct);
            item.addEventListener('keyup', (event) => {
                if (event.key === 'Enter') {
                    navigateToProduct();
                }
            });

            item.appendChild(image);
            item.appendChild(meta);
            item.appendChild(cta);
            liveFeedContainer.appendChild(item);
        }
    }

    async function fetchLiveFeed(countryOverride = currentFilters.country) {
        if (!liveFeedContainer) return;

        liveFeedAbortController?.abort();
        liveFeedAbortController = new AbortController();
        const { signal } = liveFeedAbortController;

        liveFeedContainer.innerHTML = `<div class="live-feed__placeholder">${getLiveFeedMessage('loading')}</div>`;
        const liveRequestStartedAt = performance.now();
        setApiLiveState('live', 'pending');

        try {
            const params = new URLSearchParams({
                action: 'process',
                search_simple: 1,
                search_terms: '',
                sort_by: 'last_modified_t',
                sort_order: 'desc',
                page_size: LIVE_FEED_LIMIT,
                json: 1,
                fields: 'code,product_name,brands,image_front_small_url,last_modified_t'
            });

            if (countryOverride) {
                params.append('tagtype_1', 'countries');
                params.append('tag_contains_1', 'contains');
                params.append('tag_1', `en:${countryOverride}`);
            }

            const response = await fetch(`${CATALOGUE_API_URL}?${params.toString()}`, { signal });
            if (!response.ok) {
                throw new Error(`Live feed request failed with status ${response.status}`);
            }

            const data = await parseApiJsonResponse(response, 'Flux live');
            recentLiveFeedProducts = data.products || [];
            renderLiveFeed(recentLiveFeedProducts);
            setApiLiveState('live', 'ok', {
                duration: performance.now() - liveRequestStartedAt,
                timestamp: Date.now()
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }
            console.error('Live feed loading failed', error);
            liveFeedContainer.innerHTML = `<div class="live-feed__placeholder">${getLiveFeedMessage('empty')}</div>`;
            setApiLiveState('live', 'error', { message: error.message });
        }
    }

    // Display pagination controls
    function displayPagination(currentPage, totalCount) {
        if (!paginationContainer) {
            return;
        }

        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        paginationContainer.innerHTML = '';

        if (totalPages <= 1) return;

        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '← Previous';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                fetchProducts(currentPage - 1);
            }
        });
        paginationContainer.appendChild(prevBtn);

        // Page numbers (show max 5 pages)
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i;
            pageBtn.classList.toggle('active', i === currentPage);
            pageBtn.addEventListener('click', () => {
                fetchProducts(i);
            });
            paginationContainer.appendChild(pageBtn);
        }

        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next →';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                fetchProducts(currentPage + 1);
            }
        });
        paginationContainer.appendChild(nextBtn);
    }

    // Search functionality
    if (searchButton && searchInput) {
        const runSearch = () => {
            currentFilters.search = searchInput.value.trim();
            currentPage = 1;
            fetchProducts(currentPage);
        };

        searchButton.addEventListener('click', runSearch);
        searchInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                runSearch();
            }
        });
    }

    const SUPPORTED_BARCODE_FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'];

    function canUseLiveScanner() {
        return typeof window.BarcodeDetector === 'function' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    }

    function getManualBarcodeMessage() {
        const text = barcodeManualPrompt?.textContent?.trim();
        return text && text.length ? text : 'Entrez un code-barres pour ouvrir la fiche produit.';
    }

    function promptManualBarcode() {
        const manualValue = window.prompt(getManualBarcodeMessage());
        if (manualValue) {
            goToProductFromBarcode(manualValue);
        }
    }

    function goToProductFromBarcode(rawValue) {
        const normalized = (rawValue || '').replace(/\s+/g, '');
        if (!normalized.length) {
            return;
        }
        window.location.href = `product.html?code=${normalized}`;
    }

    function handleBarcodeDetection(value) {
        if (!value) return;
        stopBarcodeScanner();
        goToProductFromBarcode(value);
    }

    function stopBarcodeScanner() {
        barcodeScannerActive = false;
        if (barcodeScanFrame) {
            cancelAnimationFrame(barcodeScanFrame);
            barcodeScanFrame = null;
        }
        if (barcodeStream) {
            barcodeStream.getTracks().forEach(track => track.stop());
            barcodeStream = null;
        }
        if (barcodeVideo) {
            barcodeVideo.pause();
            barcodeVideo.srcObject = null;
        }
        if (barcodeOverlay) {
            barcodeOverlay.hidden = true;
        }
    }

    async function scanBarcodeFrame() {
        if (!barcodeScannerActive || !barcodeDetector) return;
        try {
            const barcodes = await barcodeDetector.detect(barcodeVideo);
            if (barcodes.length) {
                handleBarcodeDetection(barcodes[0].rawValue);
                return;
            }
        } catch (error) {
            console.warn('Barcode detection failed', error);
        }
        barcodeScanFrame = requestAnimationFrame(scanBarcodeFrame);
    }

    async function startBarcodeScanner() {
        if (!barcodeOverlay || !barcodeVideo) {
            promptManualBarcode();
            return;
        }

        if (!canUseLiveScanner()) {
            promptManualBarcode();
            return;
        }

        if (!barcodeDetector) {
            try {
                barcodeDetector = new BarcodeDetector({ formats: SUPPORTED_BARCODE_FORMATS });
            } catch (error) {
                console.warn('Barcode detector initialization failed', error);
                promptManualBarcode();
                return;
            }
        }

        try {
            barcodeOverlay.hidden = false;
            barcodeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            barcodeVideo.srcObject = barcodeStream;
            await barcodeVideo.play();
            barcodeScannerActive = true;
            barcodeScanFrame = requestAnimationFrame(scanBarcodeFrame);
        } catch (error) {
            console.error('Unable to access camera for barcode scanning', error);
            stopBarcodeScanner();
            promptManualBarcode();
        }
    }

    function handleBarcodeTrigger() {
        if (canUseLiveScanner()) {
            startBarcodeScanner();
        } else {
            promptManualBarcode();
        }
    }

    if (barcodeButton) {
        barcodeButton.addEventListener('click', handleBarcodeTrigger);
    }

    if (barcodeCancelButton) {
        barcodeCancelButton.addEventListener('click', stopBarcodeScanner);
    }

    if (barcodeOverlay) {
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !barcodeOverlay.hidden) {
                stopBarcodeScanner();
            }
        });
    }

    // Filter buttons functionality
    if (filterButtons && filterButtons.length) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;
                btn.classList.toggle('active');
                
                if (btn.classList.contains('active')) {
                    if (filter === 'vegan') currentFilters.tags.push('en:vegan');
                    if (filter === 'vegetarian') currentFilters.tags.push('en:vegetarian');
                    if (filter === 'alcohol-free') currentFilters.tags.push('en:no-alcohol');
                    if (filter === 'halal-only') currentFilters.halalOnly = true;
                } else {
                    if (filter === 'vegan') currentFilters.tags = currentFilters.tags.filter(t => t !== 'en:vegan');
                    if (filter === 'vegetarian') currentFilters.tags = currentFilters.tags.filter(t => t !== 'en:vegetarian');
                    if (filter === 'alcohol-free') currentFilters.tags = currentFilters.tags.filter(t => t !== 'en:no-alcohol');
                    if (filter === 'halal-only') currentFilters.halalOnly = false;
                }
                
                currentPage = 1;
                fetchProducts(currentPage);
            });
        });
    }

    // Sort functionality
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            currentFilters.sort = sortSelect.value;
            currentPage = 1;
            fetchProducts(currentPage);
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            currentFilters.category = categorySelect.value;
            currentPage = 1;
            fetchProducts(currentPage);
        });
    }

    if (advancedIndicator) {
        updateAdvancedIndicator();
    }

    if (advancedToggleButton && advancedPanel) {
        if (advancedPanel.id) {
            advancedToggleButton.setAttribute('aria-controls', advancedPanel.id);
        }
        advancedToggleButton.setAttribute('aria-expanded', 'false');
        advancedToggleButton.addEventListener('click', () => {
            setAdvancedPanelVisibility();
        });
    }

    if (advancedResetButton) {
        advancedResetButton.addEventListener('click', () => resetAdvancedFilters());
    }

    if (advancedApplyButton) {
        advancedApplyButton.addEventListener('click', () => applyAdvancedFiltersAndFetch());
    }

    if (advancedChips && advancedChips.length) {
        advancedChips.forEach(chip => {
            chip.addEventListener('click', () => handleAdvancedChipSelection(chip));
        });
    }

    if (palmOilToggle) {
        palmOilToggle.addEventListener('change', (event) => {
            handlePalmOilToggle(event.target.checked);
        });
    }

    if (accountPrimaryAction && accountPrimaryAction.tagName === 'BUTTON') {
        accountPrimaryAction.addEventListener('click', handleAccountAction);
    }

    if (accountSecondaryAction && accountSecondaryAction.tagName === 'BUTTON') {
        accountSecondaryAction.addEventListener('click', handleAccountAction);
    }

    if (accountWidget) {
        hydrateAccountWidget();
    }

    if (apiLiveRefreshButton) {
        apiLiveRefreshButton.addEventListener('click', () => {
            triggerApiLiveRefresh();
        });
    }

    if (liveFeedRefresh && liveFeedContainer) {
        liveFeedRefresh.addEventListener('click', () => {
            fetchLiveFeed(currentFilters.country);
        });
    }

    // FORCE GLOBAL DISPLAY BY DEFAULT - Override any localStorage/query param
    // This must be set BEFORE first fetch to ensure worldwide products display
    const queryCountry = new URLSearchParams(window.location.search).get('country');
    if (!queryCountry) {
        currentFilters.country = '';
        localStorage.removeItem('locale_country');
        console.log('[APP] Forced global display (no country filter)');
    }

    hydrateStats(currentFilters.country);

    // Initial fetch
    console.log('=== STARTING INITIAL FETCH ===');
    console.log('[APP] currentFilters.country before fetch:', currentFilters.country);
    productGrid.innerHTML = '<p style="text-align: center; padding: 3rem; font-size: 1.2rem; color: #228b22;">🔄 Chargement des produits depuis Open Beauty Facts...</p>';
    
    // Give the DOM a moment to render the loading message
    setTimeout(() => {
        fetchProducts(currentPage);
        if (liveFeedContainer) {
            fetchLiveFeed(currentFilters.country);
        }
    }, 100);

    const updateCountryFilter = (countryCode = '', shouldFetch = true) => {
        const normalized = countryCode || '';
        if (currentFilters.country === normalized) {
            return;
        }
        currentFilters.country = normalized;
        if (shouldFetch) {
            currentPage = 1;
            fetchProducts(currentPage);
        }
    };

    window.addEventListener('locale:ready', (event) => {
        const country = event.detail?.country || '';
        const countryLabel = event.detail?.countryLabel || (window.LocaleState && window.LocaleState.countryLabel) || '';
        syncCountryContextCopies();
        updateCountryContextUI(countryLabel);
        updateCountryFilter(country, false);
        hydrateStats(country);
        if (liveFeedContainer) {
            fetchLiveFeed(country);
        }
    });

    // F6 — Géolocalisation automatique (IP-based, silencieuse)
    (async function autoGeolocate() {
        const storedCountry = localStorage.getItem('hobf_country');
        if (storedCountry) return;
        try {
            const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
            if (!r.ok) return;
            const geo = await r.json();
            const code = (geo.country_name || '').toLowerCase().replace(/\s+/g, '-');
            if (!code) return;
            const sel = document.getElementById('country-select');
            if (!sel) return;
            const opts = Array.from(sel.options).map(o => o.value);
            const match = opts.find(v => v && code.includes(v)) || opts.find(v => v && v.includes(code.split('-')[0]));
            if (match) {
                sel.value = match;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                const chip = document.getElementById('country-chip');
                if (chip) chip.textContent = sel.options[sel.selectedIndex]?.text || '';
                console.log('[GEO] Pays détecté automatiquement :', match);
            }
        } catch (e) { /* silencieux */ }
    })();

    window.addEventListener('locale:country-change', (event) => {
        const country = event.detail?.country || '';
        const countryLabel = event.detail?.countryLabel || (window.LocaleState && window.LocaleState.countryLabel) || '';
        updateCountryContextUI(countryLabel);
        updateCountryFilter(country, true);
        hydrateStats(country);
        if (liveFeedContainer) {
            fetchLiveFeed(country);
        }
    });

    window.addEventListener('locale:language-change', () => {
        syncCountryContextCopies();
        updateCountryContextUI((window.LocaleState && window.LocaleState.countryLabel) || '');
        if (!liveFeedContainer) return;
        if (recentLiveFeedProducts.length) {
            renderLiveFeed(recentLiveFeedProducts);
        } else {
            fetchLiveFeed(currentFilters.country);
        }
    });

    const readStoredAuthIntent = () => {
        if (typeof localStorage === 'undefined') {
            cachedAuthIntent = null;
            return null;
        }
        if (typeof cachedAuthIntent !== 'undefined') {
            return cachedAuthIntent;
        }
        cachedAuthIntent = null;
        try {
            const rawValue = localStorage.getItem(AUTH_WELCOME_KEY);
            if (!rawValue) {
                return null;
            }
            const parsed = JSON.parse(rawValue);
            if (parsed.portal && parsed.portal !== PORTAL_ID) {
                return null;
            }
            if (parsed.timestamp && (Date.now() - parsed.timestamp) > AUTH_INTENT_TTL) {
                localStorage.removeItem(AUTH_WELCOME_KEY);
                return null;
            }
            cachedAuthIntent = parsed;
            return parsed;
        } catch (error) {
            console.warn('Unable to parse stored auth intent', error);
            try {
                localStorage.removeItem(AUTH_WELCOME_KEY);
            } catch (cleanupError) {
                console.warn('Unable to cleanup auth intent', cleanupError);
            }
            cachedAuthIntent = null;
            return null;
        }
    };

    const consumeStoredAuthIntent = () => {
        const intent = readStoredAuthIntent();
        if (!intent) {
            return null;
        }
        try {
            localStorage.removeItem(AUTH_WELCOME_KEY);
        } catch (error) {
            console.warn('Unable to clear auth intent', error);
        }
        cachedAuthIntent = null;
        return intent;
    };

    const hasPendingAuthIntent = () => Boolean(readStoredAuthIntent());

    const clearAuthRetry = () => {
        if (authRetryTimer) {
            clearTimeout(authRetryTimer);
            authRetryTimer = null;
        }
        authRetryAttempts = 0;
    };

    const scheduleAuthRetry = () => {
        if (authRetryAttempts >= AUTH_RETRY_MAX) {
            return false;
        }
        if (authRetryTimer) {
            return true;
        }
        authRetryTimer = setTimeout(() => {
            authRetryTimer = null;
            authRetryAttempts += 1;
            hydrateAccountWidget(true);
        }, AUTH_RETRY_DELAY);
        return true;
    };

    const buildWelcomeMessage = (intentType) => {
        const defaultMessage = PORTAL_ID === 'beauty'
            ? 'Merci de contribuer à Halal Open Beauty Facts.'
            : 'Merci de contribuer à Halal Open Food Facts.';
        if (intentType === 'signup') {
            return PORTAL_ID === 'beauty'
                ? 'Compte beauté créé avec succès. Bienvenue dans la communauté !'
                : 'Compte alimentaire créé avec succès. Bienvenue dans la communauté !';
        }
        if (intentType === 'signin') {
            return 'Connexion réussie. Heureux de vous revoir !';
        }
        return defaultMessage;
    };

    const setAccountChip = (name = '') => {
        if (!accountChip) return;
        const safeName = (name || '').trim();
        if (!safeName) {
            clearAccountChip();
            return;
        }
        accountChip.hidden = false;
        if (accountChipName) {
            accountChipName.textContent = safeName;
        }
        if (accountChipAvatar) {
            accountChipAvatar.textContent = safeName.charAt(0).toUpperCase();
        }
    };

    const clearAccountChip = () => {
        if (!accountChip) return;
        accountChip.hidden = true;
        if (accountChipName) {
            accountChipName.textContent = '';
        }
        if (accountChipAvatar) {
            accountChipAvatar.textContent = 'H';
        }
    };

    const recordLedgerPresence = (member = {}, source = 'session') => {
        if (!window.HalalLedger || typeof window.HalalLedger.recordMember !== 'function') {
            return;
        }
        const contributorId = (member.id || member.user_id || member.login || member.username || '').toString().trim();
        if (!contributorId) {
            return;
        }
        window.HalalLedger.recordMember({
            id: contributorId,
            name: (member.name || member.displayName || contributorId).toString().trim(),
            portal: PORTAL_ID,
            country: member.country || member.countryLabel || (window.LocaleState && window.LocaleState.countryLabel) || '',
            badges: member.badges,
            scopes: member.scopes || [PORTAL_ID],
            source,
            lastSeen: member.lastSeen || Date.now(),
            joinedAt: member.joinedAt,
            notes: member.notes
        });
    };

    const buildLedgerPayloadFromSession = (payload = {}) => {
        const contributorId = payload.user_id || payload.login || '';
        if (!contributorId) {
            return null;
        }
        const createdAt = payload?.user_fields?.created_t;
        return {
            id: contributorId,
            name: payload?.user_fields?.name || contributorId,
            country: payload?.user_fields?.address_country || payload?.country || '',
            badges: payload?.user_fields?.roles,
            joinedAt: typeof createdAt === 'number' ? createdAt * 1000 : undefined
        };
    };

    const showUserGreeting = (name = '') => {
        if (!userGreeting) return;
        const safeName = (name || '').trim();
        if (!safeName) return;
        userGreeting.hidden = false;
        if (userGreetingName) {
            userGreetingName.textContent = safeName;
        }
    };

    const clearUserGreeting = () => {
        if (!userGreeting) return;
        userGreeting.hidden = true;
        if (userGreetingName) {
            userGreetingName.textContent = '';
        }
    };

    const hideWelcomeBanner = () => {
        if (!welcomeBanner) return;
        welcomeBanner.hidden = true;
        welcomeBanner.dataset.state = 'hidden';
    };

    const renderWelcomeBanner = (contributorName, providedIntent) => {
        if (!welcomeBanner || !contributorName) return;
        const intent = providedIntent || consumeStoredAuthIntent();
        if (welcomeBanner.dataset.dismissed === 'true' && !intent) {
            return;
        }
        if (welcomeTitle) {
            welcomeTitle.textContent = `Bienvenue, ${contributorName}`;
        }
        if (welcomeMessage) {
            welcomeMessage.textContent = intent?.message || buildWelcomeMessage(intent?.type);
        }
        if (intent?.type === 'signup') {
            recordLedgerPresence({
                id: intent.username || contributorName,
                name: contributorName,
                notes: intent.message,
                joinedAt: intent.timestamp
            }, 'signup');
        }
        showUserGreeting(contributorName);
        welcomeBanner.hidden = false;
        welcomeBanner.dataset.state = intent?.type || 'session';
        if (intent) {
            delete welcomeBanner.dataset.dismissed;
        }
    };

    const emitSignupFallbackBanner = () => {
        const intent = consumeStoredAuthIntent();
        if (!intent || intent.type !== 'signup') {
            return;
        }
        const fallbackName = intent.username || 'Nouvelle contributrice Halal';
        renderWelcomeBanner(fallbackName, intent);
    };

    if (welcomeDismiss) {
        welcomeDismiss.addEventListener('click', () => {
            if (!welcomeBanner) return;
            welcomeBanner.dataset.dismissed = 'true';
            hideWelcomeBanner();
        });
    }

    async function hydrateAccountWidget(isRetry = false) {
        if (!accountWidget || !SESSION_ENDPOINT) return;
        let isAuthenticated = false;
        if (!isRetry) {
            clearAuthRetry();
        }
        setAccountWidgetState('loading');
        try {
            const response = await fetch(SESSION_ENDPOINT, { credentials: 'include' });
            if (!response.ok) {
                throw new Error(`Session status ${response.status}`);
            }
            const data = await parseApiJsonResponse(response, 'Session');
            const contributorId = data?.user_id || data?.login || '';
            isAuthenticated = data?.logged_in === 'yes' || Boolean(contributorId);
            if (isAuthenticated) {
                clearAuthRetry();
                setAccountWidgetState('signed-in', data);
                return;
            }
        } catch (error) {
            console.warn('Account widget hydration failed', error);
        }

        if (hasPendingAuthIntent()) {
            const scheduled = scheduleAuthRetry();
            if (!scheduled) {
                clearAuthRetry();
                setAccountWidgetState('signed-out');
                emitSignupFallbackBanner();
            }
        } else {
            clearAuthRetry();
            setAccountWidgetState('signed-out');
        }
    }

    function setAccountWidgetState(state, payload = {}) {
        if (!accountWidget) return;
        accountWidget.dataset.state = state;

        if (state === 'loading') {
            accountStatusLabel && (accountStatusLabel.textContent = 'Vérification en cours...');
            accountHintLabel && (accountHintLabel.textContent = 'Connexion à Open Beauty Facts...');
            setAccountAction(accountPrimaryAction, 'Chargement...', '', true);
            setAccountAction(accountSecondaryAction, 'Créer un compte', ACCOUNT_CREATE_URL, false, '_blank');
            hideWelcomeBanner();
            clearUserGreeting();
            clearAccountChip();
            return;
        }

        if (state === 'signed-in') {
            const contributorId = payload.user_id || payload.login || '';
            const contributorLink = contributorId
                ? `${CONTRIBUTOR_BASE_URL}${encodeURIComponent(contributorId)}`
                : `${API_DOMAIN}/contributor`;
            const displayName = contributorId || 'Session active';
            accountStatusLabel && (accountStatusLabel.textContent = `Connecté - ${displayName}`);
            accountHintLabel && (accountHintLabel.textContent = 'Votre session Open Beauty Facts est active.');
            setAccountAction(accountPrimaryAction, 'Voir mon tableau', contributorLink, false, '_blank');
            setAccountAction(accountSecondaryAction, 'Se déconnecter', ACCOUNT_LOGOUT_URL, false, '_blank');
            showUserGreeting(displayName);
            setAccountChip(displayName);
            const ledgerPayload = buildLedgerPayloadFromSession(payload) || { id: contributorId, name: displayName };
            recordLedgerPresence(ledgerPayload, 'session');
            renderWelcomeBanner(displayName);
            return;
        }

        accountStatusLabel && (accountStatusLabel.textContent = 'Espace contributrice');
        accountHintLabel && (accountHintLabel.textContent = 'Connectez-vous avec votre compte Open Beauty Facts.');
        setAccountAction(accountPrimaryAction, 'Se connecter', 'signin.html', false);
        setAccountAction(accountSecondaryAction, 'Créer un compte', LOCAL_SIGNUP_PAGE, false);
        hideWelcomeBanner();
        clearUserGreeting();
        clearAccountChip();
    }

    function setAccountAction(element, label, href, disabled = false, target = '_self') {
        if (!element) return;
        element.textContent = label;
        const tagName = (element.tagName || '').toUpperCase();
        if (tagName === 'BUTTON') {
            element.disabled = Boolean(disabled);
            if (href) {
                element.dataset.href = href;
            } else {
                delete element.dataset.href;
            }
            element.dataset.target = target || '_self';
            return;
        }

        if (href) {
            element.setAttribute('href', href);
        } else {
            element.removeAttribute('href');
        }
        element.setAttribute('target', target || '_self');
        if (target === '_blank') {
            element.setAttribute('rel', 'noopener');
        } else {
            element.removeAttribute('rel');
        }
        if (disabled) {
            element.setAttribute('aria-disabled', 'true');
            element.classList.add('is-disabled');
            element.tabIndex = -1;
        } else {
            element.removeAttribute('aria-disabled');
            element.classList.remove('is-disabled');
            element.tabIndex = 0;
        }
    }

    function handleAccountAction(event) {
        const button = event.currentTarget;
        if (!button || button.disabled) return;
        const destination = button.dataset.href;
        if (!destination) return;
        const target = button.dataset.target === '_blank' ? '_blank' : '_self';
        if (target === '_blank') {
            window.open(destination, '_blank', 'noopener,noreferrer');
        } else {
            window.location.href = destination;
        }
    }

    function prepareApiLiveCard(source) {
        if (!apiLiveSection) return null;
        const element = apiLiveSection.querySelector(`[data-api-source="${source}"]`);
        if (!element) return null;
        return {
            root: element,
            latency: element.querySelector('.api-live__latency'),
            hint: element.querySelector('.api-live__hint')
        };
    }

    function setApiLiveState(source, state, meta = {}) {
        const card = apiLiveCards?.[source];
        if (!card || !card.root) return;
        card.root.classList.remove('is-ok', 'is-error', 'is-pending');
        card.root.classList.add(`is-${state}`);

        if (state === 'pending') {
            card.latency && (card.latency.textContent = '...');
            card.hint && (card.hint.textContent = 'Requête en cours...');
            return;
        }

        if (state === 'ok') {
            card.latency && (card.latency.textContent = formatLatency(meta.duration));
            card.hint && (card.hint.textContent = meta.timestamp
                ? `Dernier appel à ${formatTime(meta.timestamp)}`
                : 'Actualisé');
            return;
        }

        if (state === 'error') {
            card.latency && (card.latency.textContent = 'Erreur');
            card.hint && (card.hint.textContent = meta.message || "Impossible de joindre l'API.");
        }
    }

    function formatLatency(duration) {
        if (typeof duration !== 'number' || Number.isNaN(duration)) {
            return '—';
        }
        return `${Math.max(1, Math.round(duration))} ms`;
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    function triggerApiLiveRefresh() {
        fetchProducts(currentPage || 1);
        hydrateStats(currentFilters.country);
        if (liveFeedContainer) {
            fetchLiveFeed(currentFilters.country);
        }
    }

    const apkPlaceholderLink = document.getElementById('apk-download-link');
    if (apkPlaceholderLink) {
        apkPlaceholderLink.addEventListener('click', (event) => {
            event.preventDefault();
            alert('Cette option est en cours de production. Revenez bientôt pour télécharger l\'APK.');
        });
    }
});

