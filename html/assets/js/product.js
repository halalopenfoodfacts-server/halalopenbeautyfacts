document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const barcode = urlParams.get('code');
    const productContent = document.getElementById('product-content');

    if (!productContent) {
        return;
    }

    if (!barcode) {
        productContent.innerHTML = '<p class="product-empty">Aucun code-barres fourni. Revenez au catalogue pour sélectionner un produit.</p>';
        return;
    }

    fetchProductDetails(barcode);

    async function fetchProductDetails(code) {
        try {
            const response = await fetch(`https://world.openbeautyfacts.org/api/v0/product/${code}.json`);
            const data = await response.json();

            if (data.status === 1 && data.product) {
                displayProduct(data.product);
            } else {
                productContent.innerHTML = '<p class="product-empty">Ce produit est introuvable pour le moment.</p>';
            }
        } catch (error) {
            console.error('Error fetching product:', error);
            productContent.innerHTML = '<p class="product-empty">Erreur réseau lors du chargement de la fiche produit.</p>';
        }
    }

    function displayProduct(product) {
        const imageUrl = product.image_front_url || product.image_url || 'https://static.openfoodfacts.org/images/misc/product-default.png';
        const productName = product.product_name || 'Produit halal à compléter';
        const brand = product.brands || 'Marque à confirmer';
        const quantity = product.quantity || product.serving_quantity || '';
        const categories = formatList(product.categories_tags, product.categories || 'Non renseigné');
        const countriesHtml = renderTagPills(product.countries_tags, product.countries || 'Aucun pays indiqué');
        const labelsHtml = renderTagPills(product.labels_tags, 'Aucun label halal confirmé');
        const analysisHtml = renderTagPills(product.ingredients_analysis_tags, 'Analyse en attente');
        const allergens = formatList(product.allergens_tags, 'Aucun allergène signalé');
        const additives = formatList(product.additives_tags, 'Non renseigné');
        const ingredients = formatMultiline(product.ingredients_text_fr || product.ingredients_text || 'Ajoutez la liste INCI pour aider la communauté.');
        const barcodeImage = product.code ? `https://barcodeapi.org/api/auto/${product.code}?text=${product.code}` : null;
        const editUrl = product.code ? `https://world.openbeautyfacts.org/product/${product.code}` : 'https://world.openbeautyfacts.org';
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
                                ${barcodeImage ? `<img src="${barcodeImage}" alt="Code-barres ${product.code}" class="barcode-visual">` : ''}
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
                        </div>
                        <div class="product-actions">
                            <a href="${editUrl}" target="_blank" rel="noopener" class="solid-btn">Compléter cette fiche</a>
                            <a href="add.html" class="ghost-btn">Ajouter un nouveau produit</a>
                        </div>
                    </div>
                </div>

                <div class="product-panels">
                    <article class="product-panel">
                        <h2>Ingrédients</h2>
                        <p>${ingredients}</p>
                    </article>
                    <article class="product-panel">
                        <h2>Analyse halal & allergènes</h2>
                        <ul class="product-list">
                            <li><strong>Analyse automatique :</strong> <span class="tag-wrap">${analysisHtml}</span></li>
                            <li><strong>Allergènes :</strong> ${allergens}</li>
                            <li><strong>Additifs :</strong> ${additives}</li>
                        </ul>
                    </article>
                    <article class="product-panel">
                        <h2>Dernières mises à jour</h2>
                        <p>Source : API Open Beauty Facts · Dernière modification : ${formatDate(product.last_modified_t)}.</p>
                        <p>Merci aux contributeurs : ${formatList(product.editors_tags, 'Communauté Halal Open Beauty Facts')}.</p>
                    </article>
                </div>
            </div>
        `;
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
});
