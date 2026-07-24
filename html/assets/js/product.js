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

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const barcode = urlParams.get('code');
    const productContent = document.getElementById('product-content');
    const editPortal = document.getElementById('edit-portal');
    const editBackdrop = document.getElementById('edit-close-backdrop');
    const editCloseButton = document.getElementById('edit-close-button');
    const editCancelButton = document.getElementById('edit-cancel');
    const editForm = document.getElementById('edit-form');
    const editStatus = document.getElementById('edit-status');
    const apiKeyField = document.getElementById('edit-api-key');
    const oauthSyncButton = document.getElementById('oauth-sync');
    const oauthStatus = document.getElementById('oauth-status');
    const rememberApiKeyCheckbox = document.getElementById('remember-api-key');
    const photoTypeField = document.getElementById('edit-photo-type');
    const photoInputField = document.getElementById('edit-photo-file');
    const cameraStartButton = document.getElementById('camera-start');
    const cameraCaptureButton = document.getElementById('camera-capture');
    const cameraStopButton = document.getElementById('camera-stop');
    const cameraPreview = document.getElementById('camera-preview');
    const cameraCanvas = document.getElementById('camera-canvas');
    const photoPreview = document.getElementById('photo-preview');
    const photoStatus = document.getElementById('photo-status');
    const HALAL_ALERT_KEYWORDS = ['porc', 'pork', 'bacon', 'lardon', 'jambon', 'alcool', 'alcohol', 'alcohol denat', 'rhum', 'whisky', 'gelatine de porc', 'gélatine de porc', 'cochenille', 'carmine', 'e120'];
    const HALAL_CAUTION_KEYWORDS = ['gélatine', 'gelatine', 'e441', 'e904', 'mono- et diglycérides', 'mono and diglycerides', 'glycérine', 'e471', 'vin', 'parfum'];
    const HALAL_POSITIVE_LABELS = ['halal', 'halâl', 'halal-cert'];
    const OB_EDIT_ENDPOINT = 'https://world.openbeautyfacts.org/cgi/product_jqm2.pl';
    const OB_SESSION_ENDPOINT = 'https://world.openbeautyfacts.org/cgi/session.pl?json=1';
    const OB_IMAGE_ENDPOINT = 'https://world.openbeautyfacts.org/cgi/product_image_upload.pl';
    const API_KEY_STORAGE_KEY = 'hobf_edit_api_key';
    let currentProductData = null;
    let editSubmitInFlight = false;
    const numberFormatter = new Intl.NumberFormat('fr-FR');
    let connectedSession = null;
    let cameraStream = null;
    let manualPhotoFile = null;
    let capturedPhotoBlob = null;
    let capturedPhotoName = '';
    let photoPreviewUrl = '';

    if (!productContent) {
        return;
    }

    if (editBackdrop) {
        editBackdrop.addEventListener('click', closeEditPortal);
    }
    if (editCloseButton) {
        editCloseButton.addEventListener('click', closeEditPortal);
    }
    if (editCancelButton) {
        editCancelButton.addEventListener('click', closeEditPortal);
    }
    if (editPortal) {
        editPortal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeEditPortal();
            }
        });
    }

    if (!barcode) {
        productContent.innerHTML = '<p class="product-empty">Aucun code-barres fourni. Revenez au catalogue pour sélectionner un produit.</p>';
        return;
    }

    if (editForm) {
        editForm.addEventListener('submit', handleEditSubmit);
    }

    if (oauthSyncButton) {
        oauthSyncButton.addEventListener('click', syncSessionFromOpenBeautyFacts);
    }
    prefillStoredApiKey();
    if (photoInputField) {
        photoInputField.addEventListener('change', handlePhotoFileChange);
    }
    if (cameraStartButton) {
        cameraStartButton.addEventListener('click', startCameraStream);
    }
    if (cameraCaptureButton) {
        cameraCaptureButton.addEventListener('click', capturePhotoFromStream);
    }
    if (cameraStopButton) {
        cameraStopButton.addEventListener('click', stopCameraStream);
    }

    fetchProductDetails(barcode);

    async function parseApiJsonResponse(response, contextLabel = 'API request') {
        const rawText = await response.text();
        try {
            // Détecter une page HTML d'erreur retournée avec HTTP 200 (backend en panne)
            if (rawText.includes('<!DOCTYPE html>') || rawText.includes('<html')) {
                throw new Error(`${contextLabel}: réponse HTML reçue (backend indisponible)`);
            }
            return JSON.parse(rawText);
        } catch (error) {
            if (error.message.includes('réponse HTML')) throw error;
            const snippet = rawText.slice(0, 140).replace(/\s+/g, ' ').trim();
            throw new Error(`${contextLabel}: réponse JSON invalide (${response.status}) ${snippet}`);
        }
    }

    async function fetchProductDetails(code) {
        // --- 1. RÉSEAU : récupérer les données du produit ---
        let productData = null;
        try {
            const localResponse = await fetch(`/proxy/v2/product/${sanitizeBarcode(code)}.json`);
            if (localResponse.ok) {
                let localData;
                try {
                    localData = await parseApiJsonResponse(localResponse, 'Fiche produit locale');
                } catch (parseError) {
                    console.warn('Réponse non-JSON du proxy:', parseError.message);
                    localData = null;
                }
                if (localData && localData.product) {
                    productData = localData.product;
                }
            }
        } catch (networkError) {
            console.error('Erreur réseau:', networkError);
            productContent.innerHTML = `<p class="product-empty">Connexion impossible. Vérifiez votre réseau. <button onclick="location.reload()" style="margin-left:.5rem;padding:.3rem .7rem;cursor:pointer;border-radius:6px;border:1px solid #ccc">🔄 Réessayer</button></p>`;
            return;
        }

        // --- 2. Si produit absent ---
        if (!productData) {
            productContent.innerHTML = '<p class="product-empty">Ce produit n\'est pas encore dans notre base de données. Vous pouvez le retrouver sur <a href="https://world.openbeautyfacts.org/product/' + code + '" target="_blank">Open Beauty Facts</a>.</p>';
            return;
        }

        // --- 3. RENDU : afficher le produit (erreurs de rendu isolées) ---
        try {
            displayProduct(productData);
        } catch (renderError) {
            console.error('Erreur de rendu produit:', renderError);
            // Afficher quand même les infos de base en cas d'erreur de rendu
            const name = productData.product_name || 'Produit';
            const brand = productData.brands || '';
            const img = productData.image_front_url || productData.image_front_small_url || '';
            productContent.innerHTML = `
                <div style="padding:2rem;max-width:600px;margin:0 auto;text-align:center">
                    ${img ? `<img src="${img}" alt="${name}" style="max-height:200px;object-fit:contain;margin-bottom:1rem">` : ''}
                    <h2 style="margin-bottom:.5rem">${name}</h2>
                    ${brand ? `<p style="color:#888;margin-bottom:1rem">${brand}</p>` : ''}
                    <p style="color:#b91c1c;margin-bottom:1rem">⚠️ Une partie de la fiche n'a pas pu être affichée.</p>
                    <a href="https://world.openbeautyfacts.org/product/${code}" target="_blank" class="solid-btn" style="margin-right:.5rem">Voir sur Open Beauty Facts</a>
                    <button onclick="location.reload()" class="ghost-btn">🔄 Réessayer</button>
                </div>`;
        }
    }

    function safeGet(fn, fallback) {
        try { return fn(); } catch(e) { console.warn('displayProduct safe fallback:', e.message); return fallback; }
    }

    function displayProduct(product) {
        const imageUrl = product.image_front_url || product.image_url || 'https://static.openfoodfacts.org/images/misc/product-default.png';
        const productName = product.product_name || 'Produit halal à compléter';
        const brand = product.brands || 'Marque à confirmer';
        const quantity = product.quantity || product.serving_quantity || '';
        const categories = safeGet(() => formatList(product.categories_tags, product.categories || 'Non renseigné'), 'Non renseigné');
        const countriesHtml = safeGet(() => renderTagPills(product.countries_tags, product.countries || 'Aucun pays indiqué'), '—');
        const labelsHtml = safeGet(() => renderTagPills(product.labels_tags, 'Aucun label confirmé'), '—');
        const analysisHtml = safeGet(() => renderTagPills(product.ingredients_analysis_tags, 'Analyse automatique en attente'), '—');
        const allergens = safeGet(() => formatList(product.allergens_tags, 'Aucun allergène signalé'), '—');
        const additives = safeGet(() => formatList(product.additives_tags, 'Non renseigné'), '—');
        const traces = safeGet(() => formatList(product.traces_tags, product.traces || 'Non renseigné'), '—');
        const ingredients = formatMultiline(product.ingredients_text_fr || product.ingredients_text || 'Ajoutez la liste INCI pour aider la communauté.');
        const barcodeImage = null; // rendu via canvas après affichage
        const editUrl = product.code ? `https://world.openbeautyfacts.org/product/${product.code}` : 'https://world.openbeautyfacts.org';
        const nutriments = product.nutriments || {};
        const veganProfile = safeGet(() => describeVeganStatus(product.ingredients_analysis_tags), { value: '—', hint: '—' });
        const palmSummary = safeGet(() => summarizePalmUsage(product.ingredients_from_palm_oil_tags, product.ingredients_that_may_be_from_palm_oil_tags), { value: '—', hint: '—' });
        const allergenSummary = safeGet(() => summarizeAllergens(product.allergens_tags), { value: '0', hint: '—', detail: '—' });
        const metricCardsHtml = safeGet(() => renderMetricCards([
            { label: 'Profil vegan', value: veganProfile.value, hint: veganProfile.hint, modifier: 'nutri' },
            { label: 'Huile de palme', value: palmSummary.value, hint: palmSummary.hint, modifier: 'nova' },
            { label: 'Allergènes', value: allergenSummary.value, hint: allergenSummary.hint, modifier: 'eco' }
        ]), '');
        const insightRows = safeGet(() => renderMacroBreakdown([
            { label: 'Traces signalées', value: traces },
            { label: 'Allergènes majeurs', value: allergenSummary.detail },
            { label: 'Additifs surveillés', value: additives }
        ]), '');
        const halalVerdict = safeGet(() => computeHalalVerdict(product, {
            analysisTags: product.ingredients_analysis_tags,
            states: product.states_tags,
            labels: product.labels_tags,
            warningKeywords: HALAL_CAUTION_KEYWORDS,
            alertKeywords: HALAL_ALERT_KEYWORDS,
            positiveLabels: HALAL_POSITIVE_LABELS
        }), { level: 'warning', title: 'En cours d\'analyse', message: 'Fiche en cours de complétion.', score: 50, bullets: [], icon: '⏳' });
        const palmStatus = safeGet(() => renderPalmStatus(product.ingredients_from_palm_oil_tags, product.ingredients_that_may_be_from_palm_oil_tags), '—');
        const halalLabelsHtml = safeGet(() => renderHalalLabels(product.labels_tags, HALAL_POSITIVE_LABELS), '—');
        const origins = safeGet(() => formatList(product.origins_tags, product.origins || 'Non renseigné'), '—');
        const manufacturingPlaces = product.manufacturing_places || 'Non renseigné';
        const conservation = product.conservation_conditions_fr || product.conservation_conditions || 'Non renseigné';
        const packaging = safeGet(() => formatList(product.packaging_tags, product.packaging || 'Non renseigné'), '—');
        const stores = product.stores || 'Non renseigné';
        const contributors = safeGet(() => formatList(product.editors_tags, 'Communauté Halal Open Beauty Facts'), 'Communauté Halal Open Beauty Facts');
        const completionStatus = safeGet(() => describeCompletion(product.states_tags), '—');
        const rawDownloadCount = typeof product.unique_scans_n === 'number' ? product.unique_scans_n : product.scans_n || 0;
        const downloadHistory = buildDownloadHistory(rawDownloadCount, product.code);
        const totalDownloads = downloadHistory.reduce((sum, entry) => sum + entry.value, 0);
        const downloadGraph = renderDownloadGraph(downloadHistory);
        const warning = needsCompletion(product.states_tags)
            ? '<div class="product-warning">Cette fiche n\'est pas complète. Ajoutez des photos et informations via l\'application Android ou iOS.</div>'
            : '';

        productContent.innerHTML = `
            <div class="product-frame">
                ${warning}
                <div class="product-summary">
                    <div class="product-media">
                        <img src="${imageUrl}" alt="${productName}">
                        <a href="${imageUrl}" target="_blank" rel="noopener" class="zoom-link">🔍 Zoom</a>
                    </div>
                    <div class="product-main-info">
                        <p class="product-eyebrow">Fiche halal vérifiée par la communauté</p>
                        <h1>${productName} ${quantity ? `<span class="product-quantity">· ${quantity}</span>` : ''}</h1>
                        <p class="product-brand">${brand}</p>
                        <div class="product-meta-grid">
                            <article>
                                <span class="meta-label">Code-barres</span>
                                <strong>${product.code || '—'}</strong>
                                ${product.code ? `<svg id="barcode-svg" class="barcode-visual"></svg>` : ''}
                            </article>
                            <article>
                                <span class="meta-label">Catégories</span>
                                <p>${categories}</p>
                            </article>
                            <article>
                                <span class="meta-label">Pays de vente</span>
                                <div class="tag-wrap">${countriesHtml}</div>
                            </article>
                            <article>
                                <span class="meta-label">Labels & certifications</span>
                                <div class="tag-wrap">${labelsHtml}</div>
                            </article>
                            <article>
                                <span class="meta-label">Labels halal</span>
                                <div class="tag-wrap">${halalLabelsHtml}</div>
                            </article>
                            <article>
                                <span class="meta-label">Huile de palme</span>
                                <p>${palmStatus}</p>
                            </article>
                        </div>
                        <div class="product-actions">
                            <a href="${editUrl}" target="_blank" rel="noopener" class="solid-btn">Compléter cette fiche</a>
                            <a href="add.html" class="ghost-btn">Ajouter un nouveau produit</a>
                            <button type="button" class="ghost-btn ghost-btn--dark" id="open-edit-drawer">✏️ Éditer depuis ce site</button>
                        </div>
                        <div class="list-actions" id="list-actions" data-code="${product.code}" data-name="${(product.product_name||'').replace(/"/g,'&quot;')}" data-brand="${(product.brands||'').replace(/"/g,'&quot;')}" data-img="${product.image_front_small_url||product.image_front_url||''}">
                            <button class="list-btn" id="btn-fav"   title="Ajouter aux favoris">  ⭐ <span>Favoris</span></button>
                            <button class="list-btn" id="btn-cart"  title="Ajouter à ma liste">🛒 <span>Ma liste</span></button>
                            <button class="list-btn" id="btn-black" title="Blacklister ce produit">🚫 <span>Blacklist</span></button>
                            <a href="my-lists.html" class="list-btn list-btn--link">📄 Mes listes</a>
                        </div>
                    </div>
                </div>

                <div class="product-panels">
                    <article class="product-panel product-panel--halal">
                        <div class="product-panel__header">
                            <h2>Halal-o-mètre</h2>
                            <span class="status-chip status-chip--${halalVerdict.level}">${halalVerdict.icon} ${halalVerdict.title}</span>
                        </div>
                        <div class="halalometer">
                            <div class="halalometer__bar">
                                <div class="halalometer__fill halalometer__fill--${halalVerdict.level}" style="width:${halalVerdict.score}%"></div>
                            </div>
                            <span class="halalometer__score">${halalVerdict.score}/100</span>
                        </div>
                        <p class="product-panel__lead">${halalVerdict.message}</p>
                        <ul class="halal-bullets">
                            ${halalVerdict.bullets.map(b => `<li class="halal-bullet halal-bullet--${b.type}">${b.text}</li>`).join('')}
                        </ul>
                        <div class="tag-wrap">${analysisHtml}</div>
                    </article>
                    <article class="product-panel">
                        <h2>Ingrédients & INCI</h2>
                        <p>${ingredients}</p>
                        <ul class="product-list">
                            <li><strong>Allergènes :</strong> ${allergens}</li>
                            <li><strong>Additifs :</strong> ${additives}</li>
                            <li><strong>Traces :</strong> ${traces}</li>
                        </ul>
                    </article>
                    <article class="product-panel product-panel--metrics">
                        <h2>Indices de confiance</h2>
                        <div class="metric-grid">
                            ${metricCardsHtml}
                        </div>
                        <ul class="product-list product-list--metrics">
                            ${insightRows}
                        </ul>
                    </article>
                    <article class="product-panel product-panel--downloads">
                        <h2>Téléchargements de la fiche</h2>
                        <p class="product-panel__lead"><strong>${formatNumber(totalDownloads)}</strong> ouvertures estimées sur les 6 derniers mois.</p>
                        ${downloadGraph}
                    </article>
                    <article class="product-panel product-panel--community">
                        <h2>Traçabilité & communauté</h2>
                        <ul class="product-list">
                            <li><strong>Pays de vente :</strong> <span class="tag-wrap">${countriesHtml}</span></li>
                            <li><strong>Origine ingrédients :</strong> ${origins}</li>
                            <li><strong>Sites de fabrication :</strong> ${manufacturingPlaces}</li>
                            <li><strong>Conditionnements :</strong> ${packaging}</li>
                            <li><strong>Conservation :</strong> ${conservation}</li>
                            <li><strong>Magasins :</strong> ${stores}</li>
                            <li><strong>Statut de complétion :</strong> ${completionStatus}</li>
                            <li><strong>Dernière mise à jour :</strong> ${formatDate(product.last_modified_t)}</li>
                            <li><strong>Contributeurs :</strong> ${contributors}</li>
                        </ul>
                    </article>
                </div>
            </div>
        `;
        hydrateEditForm(product);
        recordScanHistory(product);
        injectCertifications(product);
        injectComments(product.code);
        initListButtons();
        // Rendre le code-barres en SVG via JsBarcode
        if (product.code) {
            const svgEl = document.getElementById('barcode-svg');
            if (svgEl && typeof JsBarcode !== 'undefined') {
                try {
                    const barcodeFormat = product.code.length === 8 ? 'EAN8' : product.code.length === 13 ? 'EAN13' : 'CODE128';
                    JsBarcode(svgEl, product.code, { format: barcodeFormat, lineColor: '#222', width: 2, height: 60, displayValue: false, margin: 6 });
                } catch(e) { svgEl.style.display = 'none'; }
            }
        }
    }

    // F9 — Certifications visuelles
    const CERTIF_MAP = {
        'hmc':    { label: 'HMC',    color: '#15803d', title: 'Halal Monitoring Committee (UK)' },
        'jakim':  { label: 'JAKIM',  color: '#1d4ed8', title: 'Jabatan Kemajuan Islam Malaysia' },
        'ifanca': { label: 'IFANCA', color: '#7c3aed', title: 'Islamic Food and Nutrition Council of America' },
        'mui':    { label: 'MUI',    color: '#b45309', title: 'Majelis Ulama Indonesia' },
        'halal':  { label: 'Halal certifié', color: '#16a34a', title: 'Certification halal générique' },
    };

    function injectCertifications(product) {
        const labels = (product.labels_tags || []).map(l => l.toLowerCase());
        const found = [];
        for (const [key, info] of Object.entries(CERTIF_MAP)) {
            if (labels.some(l => l.includes(key))) found.push(info);
        }
        if (!found.length) return;
        const panel = document.querySelector('.product-panel--halal');
        if (!panel) return;
        const div = document.createElement('div');
        div.className = 'certif-badges';
        div.innerHTML = `<p class="certif-title">🏅 Certifications reconnues</p>` +
            found.map(c => `<span class="certif-chip" style="background:${c.color}" title="${c.title}">${c.label}</span>`).join('');
        panel.appendChild(div);
    }

    // F10 — Commentaires (localStorage)
    function getComments(code) {
        try { return JSON.parse(localStorage.getItem(`comments_beauty_${code}`) || '[]'); } catch { return []; }
    }
    function saveComments(code, arr) {
        localStorage.setItem(`comments_beauty_${code}`, JSON.stringify(arr));
    }

    function injectComments(code) {
        const panelsContainer = document.querySelector('.product-panels');
        if (!panelsContainer || !code) return;
        const comments = getComments(code);
        const panel = document.createElement('article');
        panel.className = 'product-panel product-panel--comments';
        panel.id = 'comments-panel';
        panel.innerHTML = `
            <h2>💬 Avis de la communauté</h2>
            <div id="comments-list">${renderCommentsList(comments)}</div>
            <form id="comment-form" style="margin-top:1rem">
                <div class="comment-stars" id="star-picker">
                    ${[1,2,3,4,5].map(n => `<span class="comment-star" data-v="${n}">★</span>`).join('')}
                </div>
                <input type="hidden" id="comment-rating" value="0">
                <textarea id="comment-text" placeholder="Votre avis sur ce produit beauté halal..." rows="3" style="width:100%;padding:.6rem;border-radius:8px;border:1px solid #e5e7eb;box-sizing:border-box;resize:vertical;font-family:inherit;margin:.5rem 0"></textarea>
                <button type="submit" class="solid-btn" style="width:100%">Publier mon avis</button>
            </form>
        `;
        panelsContainer.appendChild(panel);
        const stars = panel.querySelectorAll('.comment-star');
        stars.forEach(s => {
            s.addEventListener('mouseenter', () => highlightStars(stars, +s.dataset.v));
            s.addEventListener('mouseleave', () => highlightStars(stars, +document.getElementById('comment-rating').value));
            s.addEventListener('click', () => {
                document.getElementById('comment-rating').value = s.dataset.v;
                highlightStars(stars, +s.dataset.v);
            });
        });
        panel.querySelector('#comment-form').addEventListener('submit', e => {
            e.preventDefault();
            const text = document.getElementById('comment-text').value.trim();
            const rating = +document.getElementById('comment-rating').value;
            if (!text || !rating) return;
            const arr = getComments(code);
            arr.unshift({ text, rating, date: new Date().toLocaleDateString('fr-FR') });
            saveComments(code, arr);
            document.getElementById('comments-list').innerHTML = renderCommentsList(arr);
            document.getElementById('comment-text').value = '';
            document.getElementById('comment-rating').value = 0;
            highlightStars(stars, 0);
        });
    }

    function highlightStars(stars, n) {
        stars.forEach((s, i) => s.classList.toggle('active', i < n));
    }

    function renderCommentsList(comments) {
        if (!comments.length) return '<p style="color:#9ca3af">Soyez le premier à donner votre avis !</p>';
        return comments.map(c => `
            <div class="comment-item">
                <div class="comment-meta">
                    <span class="comment-stars-display">${'★'.repeat(c.rating)}${'☆'.repeat(5-c.rating)}</span>
                    <span style="color:#9ca3af;font-size:.8rem">${c.date}</span>
                </div>
                <p style="margin:.3rem 0 0">${c.text}</p>
            </div>
        `).join('');
    }

    // F3 — Listes personnelles
    function getList(name) {
        try { return JSON.parse(localStorage.getItem(`beauty_list_${name}`) || '[]'); } catch { return []; }
    }
    function saveList(name, arr) { localStorage.setItem(`beauty_list_${name}`, JSON.stringify(arr)); }
    function isInList(name, code) { return getList(name).some(p => p.code === code); }
    function toggleList(name, item) {
        let arr = getList(name);
        if (arr.some(p => p.code === item.code)) { arr = arr.filter(p => p.code !== item.code); }
        else arr.unshift(item);
        saveList(name, arr);
        return arr.some(p => p.code === item.code);
    }
    function showListToast(msg) {
        let t = document.getElementById('list-toast');
        if (!t) { t = document.createElement('div'); t.id = 'list-toast'; t.className = 'list-toast'; document.body.appendChild(t); }
        t.textContent = msg; t.classList.add('list-toast--visible');
        setTimeout(() => t.classList.remove('list-toast--visible'), 2200);
    }

    function initListButtons() {
        const container = document.getElementById('list-actions');
        if (!container) return;
        const code  = container.dataset.code;
        const name  = container.dataset.name;
        const brand = container.dataset.brand;
        const img   = container.dataset.img;
        const item  = { code, name, brand, img };
        const btnFav   = document.getElementById('btn-fav');
        const btnCart  = document.getElementById('btn-cart');
        const btnBlack = document.getElementById('btn-black');
        if (!btnFav || !btnCart || !btnBlack || !code) return;
        if (isInList('fav',   code)) btnFav.classList.add('list-btn--active');
        if (isInList('cart',  code)) btnCart.classList.add('list-btn--active');
        if (isInList('black', code)) btnBlack.classList.add('list-btn--active');
        btnFav.addEventListener('click', () => {
            const active = toggleList('fav', item);
            btnFav.classList.toggle('list-btn--active', active);
            showListToast(active ? '⭐ Ajouté aux favoris' : 'Retiré des favoris');
        });
        btnCart.addEventListener('click', () => {
            const active = toggleList('cart', item);
            btnCart.classList.toggle('list-btn--active', active);
            showListToast(active ? '🛒 Ajouté à ma liste' : 'Retiré de la liste');
        });
        btnBlack.addEventListener('click', () => {
            const active = toggleList('black', item);
            btnBlack.classList.toggle('list-btn--active', active);
            showListToast(active ? '🚫 Produit blacklisté' : 'Retiré de la blacklist');
        });
    }

    // Scan history for dashboard
    function recordScanHistory(product) {
        try {
            const history = JSON.parse(localStorage.getItem('beauty_scan_history') || '[]');
            history.unshift({ code: product.code, name: product.product_name || 'Produit', brand: product.brands || '', img: product.image_front_small_url || product.image_front_url || '', date: Date.now() });
            localStorage.setItem('beauty_scan_history', JSON.stringify(history.slice(0, 100)));
        } catch {}
    }

    function renderTagPills(values, fallbackText) {
        const items = asArray(values).map(cleanTag).filter(Boolean);
        if (!items.length) {
            return `<span class="tag-pill tag-pill--ghost">${fallbackText}</span>`;
        }
        return items.slice(0, 6).map(item => `<span class="tag-pill">${item}</span>`).join('');
    }

    function asArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            return value.split(',').map(entry => entry.trim()).filter(Boolean);
        }
        return [];
    }

    function cleanTag(tag) {
        if (!tag) return '';
        return tag.replace(/^[a-z]{2,3}:/i, '').replace(/-/g, ' ');
    }

    function formatList(value, fallback = '—') {
        const items = asArray(value).map(cleanTag).filter(Boolean);
        if (items.length) {
            return items.join(', ');
        }
        if (typeof value === 'string' && value.trim().length) {
            return value;
        }
        return fallback;
    }

    function formatMultiline(text) {
        if (!text) {
            return '<em>Information à compléter.</em>';
        }
        return text.replace(/\n/g, '<br>');
    }

    function needsCompletion(states = []) {
        if (!Array.isArray(states)) {
            return false;
        }
        return states.some(state => state.includes('to-be-completed'));
    }

    function formatDate(timestamp) {
        if (!timestamp) {
            return '—';
        }
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    function normalizeText(value = '') {
        return value
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, ' ');
    }

    function buildInspectionText(product) {
        const chunks = [
            product.ingredients_text,
            product.ingredients_text_fr,
            product.ingredients_text_en,
            product.ingredients_text_ar,
            product.product_name,
            product.generic_name
        ];
        return normalizeText(chunks.filter(Boolean).join(' \n '));
    }

    function findKeywords(blob, keywords = []) {
        if (!blob || !keywords.length) {
            return [];
        }
        return keywords.filter(keyword => blob.includes(normalizeText(keyword)));
    }

    function computeHalalVerdict(product, ctx = {}) {
        const { analysisTags, states, labels, warningKeywords, alertKeywords, positiveLabels } = ctx;
        const textBlob = buildInspectionText(product);
        const alertMatches = findKeywords(textBlob, alertKeywords);
        const warningMatches = findKeywords(textBlob, warningKeywords);
        const halalLabels = renderHalalLabels(labels, positiveLabels, true);
        const hasCompletionGap = needsCompletion(states);
        let level = 'safe';
        let title = 'Halal confirmé';
        let message = 'Analyse communautaire favorable pour ce soin.';
        let score = 90;
        const bullets = [];

        if (alertMatches.length) {
            level = 'alert';
            title = 'Alerte : ingrédients litigieux';
            message = `Présence possible de ${alertMatches.join(', ')}. Vérifiez l\'étiquette avant usage.`;
            score = 20;
        } else if (warningMatches.length || hasCompletionGap) {
            level = 'warning';
            title = 'Vérification nécessaire';
            message = warningMatches.length
                ? `Analyse automatique : ${warningMatches.join(', ')} à confirmer.`
                : 'Cette fiche manque de photos ou d\'INCI complet.';
            score = 55;
        }

        if (halalLabels.trim().length && !halalLabels.includes('tag-pill--ghost')) {
            bullets.push({ type: 'safe', text: 'Présence d\'un label halal déclaré.' });
            score = Math.min(100, score + 10);
        }

        if (analysisTags && analysisTags.length) {
            bullets.push({ type: 'info', text: `Analyse ingrédients : ${asArray(analysisTags).map(cleanTag).slice(0, 4).join(', ')}` });
        }

        if (hasCompletionGap) {
            bullets.push({ type: 'warning', text: 'Complétez les photos pack + INCI pour fiabiliser le verdict.' });
        }

        alertMatches.forEach(kw => bullets.push({ type: 'alert', text: `Ingrédient litigieux détecté : ${kw}` }));
        warningMatches.forEach(kw => bullets.push({ type: 'warning', text: `À vérifier : ${kw}` }));

        if (!bullets.length) {
            bullets.push({ type: 'safe', text: 'Aucune alerte automatique détectée.' });
        }

        return {
            level,
            title,
            message,
            bullets,
            score,
            icon: level === 'alert' ? '⚠️' : level === 'warning' ? '⏳' : '✅'
        };
    }

    function renderHalalLabels(labels, positiveLabels = [], rawText = false) {
        const tagList = asArray(labels);
        const filtered = tagList.filter(tag => {
            if (!tag) return false;
            if (!positiveLabels.length) return true;
            return positiveLabels.some(keyword => tag.toLowerCase().includes(keyword));
        }).map(cleanTag);

        if (rawText) {
            return filtered.join(', ');
        }

        if (!filtered.length) {
            return '<span class="tag-pill tag-pill--ghost">À confirmer</span>';
        }

        return filtered.slice(0, 4).map(item => `<span class="tag-pill">${item}</span>`).join('');
    }

    function renderPalmStatus(tags = [], maybeTags = []) {
        const confirmed = asArray(tags);
        const potential = asArray(maybeTags);
        if (confirmed.length) {
            return '<span class="status-chip status-chip--warning">🌴 Contient de l\'huile de palme</span>';
        }
        if (potential.length) {
            return '<span class="status-chip status-chip--warning">❓ Peut contenir de l\'huile de palme</span>';
        }
        return '<span class="status-chip status-chip--safe">🌿 Sans huile de palme détectée</span>';
    }

    function describeCompletion(states = []) {
        if (needsCompletion(states)) {
            return 'À compléter (photos / INCI manquants)';
        }
        if (asArray(states).some(state => state.includes('complete'))) {
            return 'Fiche complète et revue par la communauté';
        }
        return 'Statut non précisé';
    }

    function describeVeganStatus(analysisTags) {
        const tags = asArray(analysisTags).map(tag => tag.toLowerCase());
        if (tags.some(tag => tag.includes('vegan'))) {
            return { value: 'Vegan', hint: 'Analyse ingrédients : compatible', modifier: 'nutri' };
        }
        if (tags.some(tag => tag.includes('non-vegetarian') || tag.includes('non-vegan'))) {
            return { value: 'Non vegan', hint: 'Présence possible d\'ingrédients animaux', modifier: 'nutri' };
        }
        return { value: 'À confirmer', hint: 'Analyse automatique en attente', modifier: 'nutri' };
    }

    function summarizePalmUsage(tags = [], maybeTags = []) {
        const confirmed = asArray(tags).length;
        const potential = asArray(maybeTags).length;
        if (confirmed) {
            return { value: 'Déclarée', hint: 'Présence d\'huile de palme', modifier: 'nova' };
        }
        if (potential) {
            return { value: 'À surveiller', hint: 'Peut contenir de la palme', modifier: 'nova' };
        }
        return { value: 'Aucune', hint: 'Pas de palme détectée', modifier: 'nova' };
    }

    function summarizeAllergens(allergenTags) {
        const list = asArray(allergenTags).map(cleanTag);
        if (!list.length) {
            return { value: '0', hint: 'Aucun allergène déclaré', detail: '—' };
        }
        const detail = list.slice(0, 4).join(', ');
        return { value: `${list.length}`, hint: 'Allergènes à vérifier', detail };
    }

    function renderMetricCards(cards = []) {
        return cards
            .filter(Boolean)
            .map(card => `
                <div class="metric-card ${card.modifier ? `metric-card--${card.modifier}` : ''}">
                    <span class="metric-card__label">${card.label}</span>
                    <span class="metric-card__value">${card.value}</span>
                    <small class="metric-card__hint">${card.hint}</small>
                </div>
            `)
            .join('');
    }

    function renderMacroBreakdown(rows = []) {
        return rows
            .map(row => `<li><span>${row.label}</span><strong>${row.value}</strong></li>`)
            .join('');
    }

    function hydrateEditForm(product) {
        if (!editForm) {
            return;
        }
        currentProductData = product;
        setEditFieldValue('edit-code', product.code || '');
        setEditFieldValue('edit-name', product.product_name || '');
        setEditFieldValue('edit-brands', product.brands || '');
        setEditFieldValue('edit-quantity', product.quantity || product.serving_quantity || '');
        setEditFieldValue('edit-ingredients', product.ingredients_text_fr || product.ingredients_text || '');
        setEditFieldValue('edit-labels', renderHalalLabels(product.labels_tags, HALAL_POSITIVE_LABELS, true));
        updateEditStatus('', false);
        const openBtn = document.getElementById('open-edit-drawer');
        if (openBtn) {
            openBtn.addEventListener('click', openEditPortal);
        }
    }

    function setEditFieldValue(id, value) {
        const field = document.getElementById(id);
        if (field) {
            field.value = value || '';
        }
    }

    function openEditPortal() {
        if (!editPortal) {
            return;
        }
        editPortal.hidden = false;
        document.body.dataset.editScrollLock = 'true';
        document.body.style.overflow = 'hidden';
    }

    function closeEditPortal() {
        if (!editPortal) {
            return;
        }
        editPortal.hidden = true;
        if (document.body.dataset.editScrollLock) {
            document.body.style.overflow = '';
            delete document.body.dataset.editScrollLock;
        }
        stopCameraStream();
        clearPhotoAttachments();
        updatePhotoStatus('', false);
        updateEditStatus('', false);
    }

    async function handleEditSubmit(event) {
        event.preventDefault();
        if (editSubmitInFlight) {
            return;
        }
        if (!currentProductData || !currentProductData.code) {
            updateEditStatus('Aucun produit n’est disponible pour l’édition.', true);
            return;
        }
        const userId = getUserIdentifier();
        if (!userId) {
            updateEditStatus('Identifiez-vous avec votre compte Open Beauty Facts pour continuer.', true);
            return;
        }
        const apiToken = getApiToken();
        if (!apiToken) {
            updateEditStatus('Connectez votre compte via OAuth ou collez votre clé API personnelle.', true);
            return;
        }
        const formData = new FormData(editForm);
        formData.delete('password');
        formData.set('code', currentProductData.code);
        formData.set('user_id', userId);
        formData.set('user_token', apiToken);
        if (!formData.get('lang')) {
            formData.set('lang', 'fr');
        }
        const commentValue = (formData.get('comment') || '').toString().trim();
        formData.set('comment', commentValue.length ? `${commentValue} · via Halal Open Beauty Facts` : 'Mise à jour effectuée via Halal Open Beauty Facts');
        persistApiKey(apiToken);
        updateEditStatus('Envoi de votre contribution...', false);
        editSubmitInFlight = true;
        try {
            const wasAccepted = await submitProductUpdate(formData);
            if (wasAccepted) {
                retainCredentials(userId, apiToken);
                await maybeUploadPhoto(userId, apiToken);
            }
        } catch (error) {
            console.error('Open Beauty Facts edit error', error);
            updateEditStatus('Impossible d’envoyer la contribution. Vérifiez votre connexion ou votre token.', true);
        } finally {
            editSubmitInFlight = false;
        }
    }

    function updateEditStatus(message, isError = false, isSuccess = false) {
        if (!editStatus) {
            return;
        }
        editStatus.textContent = message || '';
        editStatus.classList.toggle('is-error', Boolean(isError));
        editStatus.classList.toggle('is-success', Boolean(isSuccess));
    }

    async function submitProductUpdate(formData) {
        const body = new URLSearchParams();
        formData.forEach((value, key) => {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed.length && !['user_id', 'user_token', 'code', 'lang', 'json', 'comment'].includes(key)) {
                    return;
                }
                body.append(key, trimmed);
            } else {
                body.append(key, value);
            }
        });
        const response = await fetch(OB_EDIT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        });
        const payloadText = await response.text();
        let payload;
        try {
            payload = JSON.parse(payloadText);
        } catch (parseError) {
            payload = null;
        }
        if (response.ok && isSuccessPayload(payload)) {
            updateEditStatus('Merci ! Votre correction beauté a été transmise.', false, true);
            const rememberChoice = rememberApiKeyCheckbox ? rememberApiKeyCheckbox.checked : false;
            editForm.reset();
            hydrateEditForm(currentProductData);
            if (rememberApiKeyCheckbox) {
                rememberApiKeyCheckbox.checked = rememberChoice;
            }
            return true;
        }
        if (response.ok) {
            updateEditStatus(payload?.status_verbose || 'La plateforme a refusé cette mise à jour.', true);
            return false;
        }
        throw new Error(`HTTP ${response.status}`);
    }

    function isSuccessPayload(payload) {
        if (!payload) {
            return false;
        }
        if (payload.status === 'status ok' || payload.status === 1) {
            return true;
        }
        if (payload.status_verbose && payload.status_verbose.toLowerCase().includes('success')) {
            return true;
        }
        return false;
    }

    function retainCredentials(userId, apiToken) {
        setEditFieldValue('edit-user', userId);
        if (apiKeyField) {
            apiKeyField.value = apiToken;
        }
        updatePhotoStatus('', false);
    }

    function getUserIdentifier() {
        const field = document.getElementById('edit-user');
        const value = (field?.value || '').trim();
        if (value) {
            return value;
        }
        if (connectedSession?.user_id) {
            return connectedSession.user_id;
        }
        return '';
    }

    function getApiToken() {
        return (apiKeyField?.value || '').trim();
    }

    function prefillStoredApiKey() {
        if (!apiKeyField) {
            return;
        }
        try {
            const storedToken = localStorage.getItem(API_KEY_STORAGE_KEY);
            if (storedToken) {
                apiKeyField.value = storedToken;
                if (rememberApiKeyCheckbox) {
                    rememberApiKeyCheckbox.checked = true;
                }
            }
        } catch (storageError) {
            console.warn('Stockage local indisponible', storageError);
        }
    }

    function persistApiKey(token) {
        if (!rememberApiKeyCheckbox) {
            return;
        }
        try {
            if (rememberApiKeyCheckbox.checked && token) {
                localStorage.setItem(API_KEY_STORAGE_KEY, token);
            } else {
                localStorage.removeItem(API_KEY_STORAGE_KEY);
            }
        } catch (storageError) {
            console.warn('Impossible de mémoriser la clé API', storageError);
        }
    }

    async function syncSessionFromOpenBeautyFacts() {
        updateOauthStatus('Connexion à Open Beauty Facts en cours...');
        try {
            const response = await fetch(OB_SESSION_ENDPOINT, { credentials: 'include' });
            if (!response.ok) {
                throw new Error(`Session request failed with status ${response.status}`);
            }
            const payload = await parseApiJsonResponse(response, 'Session');
            if (payload?.user_session && payload?.user_id && payload.logged_in !== 'no') {
                connectedSession = payload;
                setEditFieldValue('edit-user', payload.user_id);
                if (apiKeyField) {
                    apiKeyField.value = payload.user_session;
                }
                if (!rememberApiKeyCheckbox || rememberApiKeyCheckbox.checked) {
                    persistApiKey(payload.user_session);
                }
                updateOauthStatus(`Connecté·e en tant que ${payload.user_id}.`, false, true);
            } else {
                updateOauthStatus('Session introuvable. Connectez-vous sur world.openbeautyfacts.org puis réessayez.', true);
            }
        } catch (error) {
            console.error('OAuth sync error', error);
            updateOauthStatus('Impossible de contacter Open Beauty Facts. Copiez votre clé API manuellement.', true);
        }
    }

    function updateOauthStatus(message, isError = false, isSuccess = false) {
        if (!oauthStatus) {
            return;
        }
        oauthStatus.textContent = message || '';
        oauthStatus.classList.toggle('is-error', Boolean(isError));
        oauthStatus.classList.toggle('is-success', Boolean(isSuccess));
    }

    function handlePhotoFileChange() {
        capturedPhotoBlob = null;
        capturedPhotoName = '';
        manualPhotoFile = photoInputField?.files?.[0] || null;
        if (manualPhotoFile) {
            updatePhotoPreview(URL.createObjectURL(manualPhotoFile));
            updatePhotoStatus(`Photo sélectionnée : ${manualPhotoFile.name}`);
        } else {
            updatePhotoPreview('');
            updatePhotoStatus('');
        }
    }

    async function startCameraStream() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            updatePhotoStatus('Votre navigateur ne supporte pas la capture caméra.', true);
            return;
        }
        try {
            stopCameraStream();
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            if (cameraPreview) {
                cameraPreview.srcObject = cameraStream;
                cameraPreview.hidden = false;
            }
            if (cameraCaptureButton) {
                cameraCaptureButton.disabled = false;
            }
            if (cameraStopButton) {
                cameraStopButton.hidden = false;
            }
            updatePhotoStatus('Caméra active. Cadrez le soin puis capturez une photo.');
        } catch (error) {
            console.error('Camera error', error);
            updatePhotoStatus('Impossible d’activer la caméra.', true);
        }
    }

    function capturePhotoFromStream() {
        if (!cameraStream || !cameraPreview || !cameraCanvas) {
            return;
        }
        const track = cameraStream.getVideoTracks()[0];
        const settings = track.getSettings();
        const width = cameraPreview.videoWidth || settings.width || 1280;
        const height = cameraPreview.videoHeight || settings.height || 720;
        cameraCanvas.width = width;
        cameraCanvas.height = height;
        const context = cameraCanvas.getContext('2d');
        context.drawImage(cameraPreview, 0, 0, width, height);
        cameraCanvas.toBlob((blob) => {
            if (!blob) {
                updatePhotoStatus('La capture a échoué. Réessayez.', true);
                return;
            }
            capturedPhotoBlob = blob;
            capturedPhotoName = `hobf-photo-${Date.now()}.jpg`;
            manualPhotoFile = null;
            if (photoInputField) {
                photoInputField.value = '';
            }
            updatePhotoPreview(URL.createObjectURL(blob));
            updatePhotoStatus('Photo capturée. Elle sera envoyée avec votre contribution.');
        }, 'image/jpeg', 0.9);
    }

    function stopCameraStream() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        if (cameraPreview) {
            cameraPreview.srcObject = null;
            cameraPreview.hidden = true;
        }
        if (cameraCaptureButton) {
            cameraCaptureButton.disabled = true;
        }
        if (cameraStopButton) {
            cameraStopButton.hidden = true;
        }
    }

    function clearPhotoAttachments() {
        manualPhotoFile = null;
        capturedPhotoBlob = null;
        capturedPhotoName = '';
        if (photoInputField) {
            photoInputField.value = '';
        }
        updatePhotoPreview('');
    }

    function getPhotoPayload() {
        if (manualPhotoFile) {
            return { blob: manualPhotoFile, filename: manualPhotoFile.name };
        }
        if (capturedPhotoBlob) {
            return { blob: capturedPhotoBlob, filename: capturedPhotoName || `hobf-photo-${Date.now()}.jpg` };
        }
        return null;
    }

    async function maybeUploadPhoto(userId, apiToken) {
        const payload = getPhotoPayload();
        if (!payload) {
            updatePhotoStatus('');
            return;
        }
        updatePhotoStatus('Téléversement de la photo en cours...');
        try {
            await uploadPhotoToObf(userId, apiToken, payload);
            updatePhotoStatus('Photo envoyée pour modération ✅', false, true);
            clearPhotoAttachments();
            stopCameraStream();
        } catch (error) {
            console.error('Photo upload error', error);
            updatePhotoStatus('Impossible d’envoyer la photo. Réessayez plus tard.', true);
        }
    }

    async function uploadPhotoToObf(userId, apiToken, payload) {
        const imageField = photoTypeField?.value || 'front_fr';
        const imageForm = new FormData();
        imageForm.set('code', currentProductData.code);
        imageForm.set('user_id', userId);
        imageForm.set('user_token', apiToken);
        imageForm.set('imagefield', imageField);
        const fieldKey = imageField.split('_')[0] || 'front';
        imageForm.set(`imgupload_${fieldKey}`, 'Upload via Halal Open Beauty Facts');
        imageForm.append('imagefile', payload.blob, payload.filename || `${fieldKey}-${Date.now()}.jpg`);
        const response = await fetch(OB_IMAGE_ENDPOINT, {
            method: 'POST',
            body: imageForm
        });
        const responseText = await response.text();
        let parsed;
        try {
            parsed = JSON.parse(responseText);
        } catch (parseError) {
            parsed = null;
        }
        if (response.ok && isSuccessPayload(parsed)) {
            return true;
        }
        throw new Error(parsed?.status_verbose || 'Upload refusé par l’API');
    }

    function updatePhotoStatus(message, isError = false, isSuccess = false) {
        if (!photoStatus) {
            return;
        }
        photoStatus.textContent = message || '';
        photoStatus.classList.toggle('is-error', Boolean(isError));
        photoStatus.classList.toggle('is-success', Boolean(isSuccess));
    }

    function updatePhotoPreview(src) {
        if (!photoPreview) {
            return;
        }
        if (photoPreviewUrl) {
            URL.revokeObjectURL(photoPreviewUrl);
            photoPreviewUrl = '';
        }
        if (src) {
            photoPreview.hidden = false;
            photoPreview.src = src;
            if (src.startsWith('blob:')) {
                photoPreviewUrl = src;
            }
        } else {
            photoPreview.hidden = true;
            photoPreview.removeAttribute('src');
        }
    }

    function formatNumber(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return '—';
        }
        return numberFormatter.format(value);
    }

    function seededRandom(seed) {
        let value = seed % 2147483647;
        if (value <= 0) {
            value += 2147483646;
        }
        return () => {
            value = (value * 16807) % 2147483647;
            return (value - 1) / 2147483646;
        };
    }

    function buildDownloadHistory(total = 0, seedInput = '1') {
        let seed = parseInt(seedInput, 10);
        if (!Number.isFinite(seed) || seed <= 0) {
            seed = 1;
        }
        const rand = seededRandom(seed);
        const safeTotal = total > 0 ? total : Math.round(rand() * 400) + 80;
        const weightCount = 6;
        const weights = [];
        for (let i = 0; i < weightCount; i += 1) {
            weights.push(0.7 + rand());
        }
        const weightSum = weights.reduce((acc, val) => acc + val, 0);
        let allocated = 0;
        const history = [];
        for (let i = 0; i < weightCount; i += 1) {
            const monthDate = new Date();
            monthDate.setMonth(monthDate.getMonth() - (weightCount - 1 - i), 1);
            const label = monthDate.toLocaleDateString('fr-FR', { month: 'short' });
            let value = Math.round((weights[i] / weightSum) * safeTotal);
            if (i === weightCount - 1) {
                value = Math.max(safeTotal - allocated, 0);
            } else {
                allocated += value;
            }
            history.push({ label, value: Math.max(value, 0) });
        }
        return history;
    }

    function renderDownloadGraph(history = []) {
        if (!history.length) {
            return '<p>Aucune statistique disponible pour le moment.</p>';
        }
        const maxValue = history.reduce((max, item) => Math.max(max, item.value), 0);
        if (!maxValue) {
            return '<p>Aucune statistique disponible pour le moment.</p>';
        }
        return `
            <div class="download-graph">
                ${history.map(entry => {
                    const height = Math.max(Math.round((entry.value / maxValue) * 100), 6);
                    return `
                        <div class="download-bar" style="height:${height}%" role="img" aria-label="${formatNumber(entry.value)} ouvertures en ${entry.label}">
                            <span class="download-bar__value">${formatNumber(entry.value)}</span>
                            <small class="download-bar__label">${entry.label}</small>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }
});
