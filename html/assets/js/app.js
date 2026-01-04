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
    const contributorsCountDisplay = document.getElementById('contributors-count');
    const countryCountDisplay = document.getElementById('country-count');
    const barcodeInput = document.getElementById('barcode-input');
    const barcodeButton = document.getElementById('barcode-button');
    const liveFeedContainer = document.getElementById('live-feed-list');
    const liveFeedRefresh = document.getElementById('refresh-live-feed');
    const liveFeedLoadingText = document.getElementById('live-feed-loading-text');
    const liveFeedEmptyText = document.getElementById('live-feed-empty-text');
    const countryContext = document.getElementById('country-context');
    const countryChip = document.getElementById('country-chip');
    const countryMessage = document.getElementById('country-message');

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

    const API_URL = 'https://world.openbeautyfacts.org/cgi/search.pl';
    const PAGE_SIZE = 50;
    const LIVE_FEED_LIMIT = 6;
    const DEFAULT_PRODUCT_IMAGE = 'https://static.openfoodfacts.org/images/misc/product-default.png';
    const numberFormatter = new Intl.NumberFormat('fr-FR');
    
    let currentPage = 1;
    let currentFilters = {
        search: '',
        tags: [],
        category: '',
        sort: 'popularity',
        country: (window.LocaleState && window.LocaleState.country) || ''
    };
    let recentLiveFeedProducts = [];
    let liveFeedAbortController;

    // Fetch and display products
    async function fetchProducts(page = 1) {
        productGrid.innerHTML = '<p style="text-align: center; padding: 2rem;">Chargement des produits...</p>';
        
        console.log('Fetching products for page:', page);
        console.log('Current filters:', currentFilters);
        
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

            // Add sorting
            if (currentFilters.sort) {
                if (currentFilters.sort === 'popularity') {
                    params.append('sort_by', 'unique_scans_n');
                } else {
                    params.append('sort_by', currentFilters.sort);
                }
            }

            const url = `${API_URL}?${params.toString()}`;
            console.log('Fetching from URL:', url);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Received data:', data);
            console.log('Number of products:', data.products ? data.products.length : 0);
            
            displayProducts(data.products || []);
            displayPagination(page, data.count || 0);
            currentPage = page;
            
        } catch (error) {
            console.error("Could not fetch products:", error);
            productGrid.innerHTML = '<p style="text-align: center; padding: 2rem; color: red;">Impossible de charger les produits. Merci de réessayer.</p>';
        }
    }

    function formatStatValue(value, fallback) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return fallback || '—';
        }
        return numberFormatter.format(Math.round(value));
    }

    async function fetchInventoryCount(country = '') {
        const params = new URLSearchParams({
            action: 'process',
            search_simple: 1,
            page_size: 1,
            json: 1,
            fields: 'code'
        });

        if (country) {
            params.append('tagtype_1', 'countries');
            params.append('tag_contains_1', 'contains');
            params.append('tag_1', `en:${country}`);
        }

        const response = await fetch(`${API_URL}?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Inventory count request failed with status ${response.status}`);
        }

        const data = await response.json();
        return typeof data.count === 'number' ? data.count : null;
    }

    async function hydrateStats(selectedCountry = '') {
        if (!productCountDisplay && !contributorsCountDisplay && !countryCountDisplay) return;

        try {
            const [inventoryCount, contributorsResponse] = await Promise.all([
                fetchInventoryCount(selectedCountry),
                fetch('https://world.openbeautyfacts.org/facets/contributors.json')
            ]);

            if (productCountDisplay && typeof inventoryCount === 'number') {
                productCountDisplay.textContent = formatStatValue(inventoryCount, productCountDisplay.dataset.fallback);
            }

            if (contributorsResponse.ok && contributorsCountDisplay) {
                const contributorsData = await contributorsResponse.json();
                const contributorCount = contributorsData?.tags?.length || contributorsData.count;
                contributorsCountDisplay.textContent = formatStatValue(contributorCount, contributorsCountDisplay.dataset.fallback);
            }

            if (countryCountDisplay) {
                countryCountDisplay.textContent = selectedCountry
                    ? '1'
                    : (countryCountDisplay.dataset.fallback || '180');
            }

        } catch (error) {
            console.warn('Stats hydration failed; falling back to defaults', error);
            if (productCountDisplay) {
                productCountDisplay.textContent = productCountDisplay.dataset.fallback || '1M+';
            }
            if (contributorsCountDisplay) {
                contributorsCountDisplay.textContent = contributorsCountDisplay.dataset.fallback || '100K';
            }
            if (countryCountDisplay) {
                countryCountDisplay.textContent = selectedCountry
                    ? '1'
                    : (countryCountDisplay.dataset.fallback || '—');
            }
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

    // Display products in grid
    function displayProducts(products) {
        productGrid.innerHTML = '';
        
        if (!products || products.length === 0) {
            productGrid.innerHTML = '<p style="text-align: center; padding: 2rem;">Aucun produit trouvé pour ces filtres.</p>';
            return;
        }

        products.forEach(product => {
            const productName = product.product_name || 'Unknown Product';
            const brand = product.brands || 'Unknown Brand';
            const imageUrl = product.image_front_small_url || product.image_front_url || DEFAULT_PRODUCT_IMAGE;
            const barcode = product.code || '';

            const productCard = document.createElement('div');
            productCard.className = 'product-card';
            productCard.innerHTML = `
                <img src="${imageUrl}" alt="${productName}" onerror="this.onerror=null;this.src='${DEFAULT_PRODUCT_IMAGE}';">
                <div class="product-info">
                    <h3>${productName}</h3>
                    <p>${brand}</p>
                </div>
            `;
            
            productCard.addEventListener('click', () => {
                window.location.href = `product.html?code=${barcode}`;
            });
            
            productGrid.appendChild(productCard);
        });
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
                window.location.href = `product.html?code=${code}`;
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

        try {
            const params = new URLSearchParams({
                action: 'process',
                search_simple: 1,
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

            const response = await fetch(`${API_URL}?${params.toString()}`, { signal });
            if (!response.ok) {
                throw new Error(`Live feed request failed with status ${response.status}`);
            }

            const data = await response.json();
            recentLiveFeedProducts = data.products || [];
            renderLiveFeed(recentLiveFeedProducts);
        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }
            console.error('Live feed loading failed', error);
            liveFeedContainer.innerHTML = `<div class="live-feed__placeholder">${getLiveFeedMessage('empty')}</div>`;
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

    function goToProductFromBarcode() {
        const rawValue = (barcodeInput?.value || '').trim();
        if (!rawValue) {
            barcodeInput && barcodeInput.focus();
            return;
        }
        const normalized = rawValue.replace(/\s+/g, '');
        window.location.href = `product.html?code=${normalized}`;
    }

    if (barcodeButton) {
        barcodeButton.addEventListener('click', goToProductFromBarcode);
    }

    if (barcodeInput) {
        barcodeInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                goToProductFromBarcode();
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
                } else {
                    if (filter === 'vegan') currentFilters.tags = currentFilters.tags.filter(t => t !== 'en:vegan');
                    if (filter === 'vegetarian') currentFilters.tags = currentFilters.tags.filter(t => t !== 'en:vegetarian');
                    if (filter === 'alcohol-free') currentFilters.tags = currentFilters.tags.filter(t => t !== 'en:no-alcohol');
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

    if (liveFeedRefresh && liveFeedContainer) {
        liveFeedRefresh.addEventListener('click', () => {
            fetchLiveFeed(currentFilters.country);
        });
    }

    hydrateStats(currentFilters.country);

    // Initial fetch
    console.log('=== STARTING INITIAL FETCH ===');
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

    const apkPlaceholderLink = document.getElementById('apk-download-link');
    if (apkPlaceholderLink) {
        apkPlaceholderLink.addEventListener('click', (event) => {
            event.preventDefault();
            alert('Cette option est en cours de production. Revenez bientôt pour télécharger l\'APK.');
        });
    }
});

