(function () {
    const COUNTRY_STORAGE_KEY = 'hobf_country';
    const LANGUAGE_STORAGE_KEY = 'hobf_language';

    const COUNTRY_ENDPOINT = '/proxy/facets/countries.json';
    const COUNTRY_CACHE_KEY = 'hobf_country_cache_v1';
    const COUNTRY_CACHE_TTL = 12 * 60 * 60 * 1000;

    const SUPPORTED_COUNTRIES = [
        { value: '', label: '🌍 World / Monde' },
        { value: 'france', label: '🇫🇷 France' },
        { value: 'morocco', label: '🇲🇦 Maroc' },
        { value: 'algeria', label: '🇩🇿 Algérie' },
        { value: 'tunisia', label: '🇹🇳 Tunisie' },
        { value: 'saudi-arabia', label: '🇸🇦 Arabie Saoudite' },
        { value: 'united-arab-emirates', label: '🇦🇪 Émirats' },
        { value: 'united-kingdom', label: '🇬🇧 Royaume-Uni' },
        { value: 'canada', label: '🇨🇦 Canada' }
    ];

    const countryLabelMap = new Map();

    function readCountryCache() {
        if (typeof localStorage === 'undefined') {
            return null;
        }
        try {
            const raw = localStorage.getItem(COUNTRY_CACHE_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw);
            if (!parsed?.timestamp || !Array.isArray(parsed.items)) {
                return null;
            }
            if (Date.now() - parsed.timestamp > COUNTRY_CACHE_TTL) {
                localStorage.removeItem(COUNTRY_CACHE_KEY);
                return null;
            }
            return parsed.items;
        } catch (error) {
            console.warn('Unable to read country cache', error);
            return null;
        }
    }

    function writeCountryCache(items = []) {
        if (typeof localStorage === 'undefined') {
            return;
        }
        try {
            localStorage.setItem(COUNTRY_CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                items: items.slice(0, 200)
            }));
        } catch (error) {
            console.warn('Unable to persist country cache', error);
        }
    }

    function rememberCountryLabel(value, label) {
        const key = (value || '').toLowerCase();
        countryLabelMap.set(key, label);
    }

    function getCountryLabel(value) {
        const key = (value || '').toLowerCase();
        return countryLabelMap.get(key) || countryLabelMap.get('') || '';
    }

    rememberCountryLabel('', '🌍 World / Monde');

    const SUPPORTED_LANGUAGES = [
        { value: '', label: '🌐 Langue / Language' },
        { value: 'fr', label: '🇫🇷 Français' },
        { value: 'en', label: '🇬🇧 English' },
        { value: 'ar', label: '🇲🇦 العربية' },
        { value: 'es', label: '🇪🇸 Español' },
        { value: 'pt', label: '🇵🇹 Português' },
        { value: 'he', label: '🇮🇱 עברית' }
    ];

    const TRANSLATIONS = {
        fr: {
            top_notice: 'Projet communautaire 100% open source · Soutenez la transparence 💚',
            nav_signin: 'Se connecter',
            nav_halal_users: '👥 Utilisateurs Halal',
            search_placeholder: 'Rechercher une marque, un ingrédient ou un produit halal',
            barcode_placeholder: 'Code-barres (ex : 3274080005003)',
            search_cta: 'Rechercher',
            barcode_cta: 'Scanner',
            barcode_hint: 'Essayez avec le 3274080005003',
            search_tab_label: 'Recherche produits',
            barcode_tab_label: 'Code-barres',
            barcode_helper: 'Scannez ou saisissez un code pour ouvrir la fiche produit.',
            hero_eyebrow: 'Base de données mondiale de produits cosmétiques halal.',
            hero_title: 'Le guide digital pour choisir des soins halal, éthiques et sûrs.',
            hero_subtitle: 'Analysez instantanément les produits cosmétiques halal.',
            hero_cta_explore: 'Explorer les produits',
            hero_cta_contribute: 'Contribuer maintenant',
            hero_cta_app: '📱 App mobile',
            stats_products: 'produits cosmétiques halal référencés',
            stats_contributors: 'Contributeurs actifs',
            stats_countries: 'Pays couverts',
            quick_catalogue_title: 'Catalogue',
            quick_catalogue_desc: 'Filtrez par labels halal, végétarien ou sans alcool en quelques clics.',
            quick_catalogue_cta: 'Voir les produits →',
            quick_engagements_title: 'Engagements',
            quick_engagements_desc: 'Découvrez nos outils d’analyse d’ingrédients et la transparence des données.',
            quick_engagements_cta: 'Lire nos engagements →',
            quick_community_title: 'Communauté',
            quick_community_desc: 'Rejoignez les bénévoles qui enrichissent la base de données au quotidien.',
            quick_community_cta: 'Rencontrer la communauté →',
            filters_title: 'Catalogue Halal',
            filters_desc: 'Sélectionnez vos critères et trouvez immédiatement des soins adaptés.',
            filter_vegan: '🌱 Vegan',
            filter_vegetarian: '🥗 Végétarien',
            filter_alcoholfree: '🚫 Sans alcool',
            family_eyebrow: 'Vies réelles, besoins réels',
            family_title: 'Les familles qui nous inspirent partagent leurs routines beauté halal.',
            family_desc: 'Ces clichés proviennent de la communauté Halal Open Beauty Facts et illustrent la diversité des consommateurs.',
            insight_1_title: '🧪 Analyse fine des ingrédients',
            insight_1_desc: 'Détection automatique des dérivés d’alcool, gélatine ou sources animales grâce aux taxonomies ouvertes.',
            insight_2_title: '📷 Scanner mobile',
            insight_2_desc: 'Connectez l’application officielle pour scanner les codes-barres et obtenir un verdict halal instantané.',
            insight_3_title: '🤝 Données ouvertes',
            insight_3_desc: 'API publique, exports CSV et widgets prêts à intégrer dans vos plateformes e-commerce.',
            community_eyebrow: 'Communauté mondiale',
            community_title: 'Contribuez à la plus grande base Halal open source.',
            community_desc: 'Photographiez les packagings, traduisez les étiquettes et validez les ingrédients sensibles pour aider le monde entier.',
            community_cta_primary: 'Ajouter un produit',
            community_cta_secondary: 'Télécharger le guide bénévole',
            community_card_text: 'produits halal ajoutés en 30 jours',
            app_title: 'Scannez un produit en magasin',
            app_desc: 'L’application Open Beauty Facts vérifie la conformité halal, l’INCI et la présence d’allergènes en temps réel.',
            live_feed_eyebrow: 'Flux communautaire',
            live_feed_title: 'Dernières contributions halal',
            live_feed_desc: 'Observer en temps réel les nouveaux ajouts et corrections de la communauté Halal Open Beauty Facts.',
            live_feed_refresh: '↻ Actualiser',
            live_feed_loading: 'Chargement du flux...',
            live_feed_empty: 'Aucune contribution récente pour le moment.',
            legal_section_title: 'Mentions légales',
            legal_section_alert: '<strong>Important :</strong> Halal Open Beauty Facts est un site citoyen d’information sur les produits cosmétiques halal. Nous ne vendons aucun produit et ne faisons la promotion d’aucune marque.',
            legal_section_indep: 'Halal Open Beauty Facts est 100% indépendant, et n’est lié à aucun industriel, distributeur ou acteur de la filière Halal.',
            legal_section_support: 'Pour toute question ou réclamation liée à un produit halal, contactez directement le service clients du fabricant ou distributeur présent sur l’emballage.',
            legal_section_owner: 'Responsable de publication : Mustapha Zentar.',
            legal_section_contact: 'contact@halalopenbeautyfacts.org',
            legal_license_title: 'Licence d’utilisation des données'
        },
        en: {
            top_notice: '100% open-source community project · Support transparency 💚',
            nav_signin: 'Sign in',
            nav_halal_users: '👥 Halal users',
            search_placeholder: 'Search a brand, ingredient or halal product',
            barcode_placeholder: 'Barcode (ex: 3274080005003)',
            search_cta: 'Search',
            barcode_cta: 'Scan',
            barcode_hint: 'Try with 3274080005003',
            search_tab_label: 'Product search',
            barcode_tab_label: 'Barcode',
            barcode_helper: 'Scan or paste a barcode to open the product sheet.',
            hero_eyebrow: 'Global halal cosmetics base',
            hero_title: 'Your digital guide to safe, ethical halal beauty.',
            hero_subtitle: 'Instantly analyze products, flag sensitive ingredients and explore the largest collaborative halal database.',
            hero_cta_explore: 'Browse products',
            hero_cta_contribute: 'Contribute now',
            hero_cta_app: '📱 Mobile app',
            stats_products: 'Indexed products',
            stats_contributors: 'Active contributors',
            stats_countries: 'Countries covered',
            quick_catalogue_title: 'Catalog',
            quick_catalogue_desc: 'Filter by halal, vegetarian or alcohol-free labels in a tap.',
            quick_catalogue_cta: 'View products →',
            quick_engagements_title: 'Commitments',
            quick_engagements_desc: 'Discover our ingredient analysis tools and data transparency.',
            quick_engagements_cta: 'Read our commitments →',
            quick_community_title: 'Community',
            quick_community_desc: 'Join the volunteers enriching the base every day.',
            quick_community_cta: 'Meet the community →',
            filters_title: 'Halal Catalog',
            filters_desc: 'Pick your criteria and instantly find suitable care.',
            filter_vegan: '🌱 Vegan',
            filter_vegetarian: '🥗 Vegetarian',
            filter_alcoholfree: '🚫 Alcohol-free',
            family_eyebrow: 'Real lives, real needs',
            family_title: 'Families share the halal beauty routines that inspire us.',
            family_desc: 'These shots come from the Halal Open Beauty Facts community and show our diversity.',
            insight_1_title: '🧪 Precise ingredient analysis',
            insight_1_desc: 'Automatic detection of alcohol, gelatin or animal derivatives using open taxonomies.',
            insight_2_title: '📷 Mobile scanner',
            insight_2_desc: 'Use the official app to scan barcodes and receive instant halal verdicts.',
            insight_3_title: '🤝 Open data',
            insight_3_desc: 'Public API, CSV exports and widgets ready for your e-commerce stack.',
            community_eyebrow: 'Global community',
            community_title: 'Contribute to the largest open halal database.',
            community_desc: 'Shoot packaging, translate labels and validate sensitive ingredients to help consumers.',
            community_cta_primary: 'Add a product',
            community_cta_secondary: 'Download the volunteer guide',
            community_card_text: 'halal products added in 30 days',
            app_title: 'Scan products in store',
            app_desc: 'The Open Beauty Facts app checks halal compliance, INCI and allergens in real time.',
            live_feed_eyebrow: 'Community radar',
            live_feed_title: 'Latest halal contributions',
            live_feed_desc: 'See real-time edits and new cosmetics published by the Halal Open Beauty Facts community.',
            live_feed_refresh: '↻ Refresh',
            live_feed_loading: 'Loading live feed...',
            live_feed_empty: 'No recent contributions yet.',
            legal_section_title: 'Legal notice',
            legal_section_alert: '<strong>Important:</strong> Halal Open Beauty Facts is a civic website about halal cosmetics. We do not sell nor promote any product.',
            legal_section_indep: 'Halal Open Beauty Facts is 100% independent and linked to no manufacturer, retailer or halal actor.',
            legal_section_support: 'For any question or claim, contact the customer service listed on the product packaging.',
            legal_section_owner: 'Publication director: Mustapha Zentar.',
            legal_section_contact: 'contact@halalopenbeautyfacts.org',
            legal_license_title: 'Data usage license'
        },
        ar: {
            top_notice: 'مشروع مجتمعي مفتوح المصدر بالكامل · ادعموا الشفافية 💚',
            nav_signin: 'تسجيل الدخول',
            nav_halal_users: '👥 مستخدمو حلال',
            search_placeholder: 'ابحث عن علامة، مكوّن أو منتج حلال',
            barcode_placeholder: 'الباركود (مثال: 3274080005003)',
            search_cta: 'بحث',
            barcode_cta: 'مسح',
            barcode_hint: 'جرّب الرمز 3274080005003',
            search_tab_label: 'بحث عن منتج',
            barcode_tab_label: 'الباركود',
            barcode_helper: 'امسح أو أدخل رمزاً لفتح صفحة المنتج.',
            hero_eyebrow: 'أكبر قاعدة لمنتجات التجميل الحلال',
            hero_title: 'دليلك الرقمي لاختيار عناية حلال وآمنة.',
            hero_subtitle: 'حلّل المنتجات فوراً، تحقّق من المكوّنات الحساسة واكتشف أكبر قاعدة تعاونية.',
            hero_cta_explore: 'اكتشف المنتجات',
            hero_cta_contribute: 'ساهم الآن',
            hero_cta_app: '📱 تطبيق الهاتف',
            stats_products: 'منتجات موثقة',
            stats_contributors: 'مساهمون نشطون',
            stats_countries: 'دول مشمولة',
            quick_catalogue_title: 'الفهرس',
            quick_catalogue_desc: 'رشّح حسب الوسوم الحلال أو النباتية أو الخالية من الكحول.',
            quick_catalogue_cta: 'عرض المنتجات →',
            quick_engagements_title: 'الالتزامات',
            quick_engagements_desc: 'اكتشف أدوات تحليل المكوّنات وشفافية البيانات.',
            quick_engagements_cta: 'اطّلع على التزاماتنا →',
            quick_community_title: 'المجتمع',
            quick_community_desc: 'انضم إلى المتطوعين الذين يثرون القاعدة يومياً.',
            quick_community_cta: 'قابل المجتمع →',
            filters_title: 'فهرس حلال',
            filters_desc: 'اختر معاييرك واعثر فوراً على العناية المناسبة.',
            filter_vegan: '🌱 نباتي',
            filter_vegetarian: '🥗 نباتي lacto',
            filter_alcoholfree: '🚫 بدون كحول',
            family_eyebrow: 'حاجات حقيقية',
            family_title: 'العائلات التي تلهمنا تشارك روتين جمالها الحلال.',
            family_desc: 'هذه الصور من مجتمع Halal Open Beauty Facts وتُظهر تنوّعنا.',
            insight_1_title: '🧪 تحليل دقيق للمكوّنات',
            insight_1_desc: 'رصد تلقائي لمشتقات الكحول والجيلاتين والمصادر الحيوانية.',
            insight_2_title: '📷 ماسح للهاتف',
            insight_2_desc: 'اربط التطبيق الرسمي لمسح الباركود والحصول على حكم فوري.',
            insight_3_title: '🤝 بيانات مفتوحة',
            insight_3_desc: 'واجهة برمجة، ملفات CSV وودجات جاهزة.',
            community_eyebrow: 'مجتمع عالمي',
            community_title: 'ساهم في أكبر قاعدة حلال مفتوحة.',
            community_desc: 'صوّر التغليف، ترجم الملصقات وحقّق في المكوّنات الحساسة.',
            community_cta_primary: 'أضف منتجاً',
            community_cta_secondary: 'حمّل دليل المتطوعين',
            community_card_text: 'منتج حلال أضيف خلال 30 يوماً',
            app_title: 'امسح المنتج في المتجر',
            app_desc: 'يتحقق تطبيق Open Beauty Facts من الحلال ومكوّنات INCI والحساسية فوراً.',
            live_feed_eyebrow: 'تحديثات المجتمع',
            live_feed_title: 'أحدث المساهمات الحلال',
            live_feed_desc: 'تابع الإضافات والتعديلات الجديدة من مجتمع Halal Open Beauty Facts.',
            live_feed_refresh: '↻ تحديث',
            live_feed_loading: 'جاري تحميل الخلاصة...',
            live_feed_empty: 'لا توجد مساهمات حديثة حالياً.',
            legal_section_title: 'إشعار قانوني',
            legal_section_alert: '<strong>مهم:</strong> Halal Open Beauty Facts موقع مجتمعي عن مستحضرات التجميل الحلال. لا نبيع أي منتج.',
            legal_section_indep: 'المشروع مستقل تماماً وغير مرتبط بأي مصنع أو موزّع.',
            legal_section_support: 'للاستفسارات يرجى التواصل مباشرة مع خدمة زبائن العلامة الموجودة على العبوة.',
            legal_section_owner: 'مسؤول النشر: مصطفى زندار.',
            legal_section_contact: 'contact@halalopenbeautyfacts.org',
            legal_license_title: 'ترخيص استخدام البيانات'
        },
        es: {
            top_notice: 'Proyecto comunitario 100% open source · Apoya la transparencia 💚',
            nav_signin: 'Iniciar sesión',
            nav_halal_users: '👥 Usuarios Halal',
            search_placeholder: 'Busca una marca, ingrediente o producto halal',
            barcode_placeholder: 'Código de barras (ej: 3274080005003)',
            search_cta: 'Buscar',
            barcode_cta: 'Escanear',
            barcode_hint: 'Prueba con 3274080005003',
            search_tab_label: 'Búsqueda de productos',
            barcode_tab_label: 'Código de barras',
            barcode_helper: 'Escanea o introduce un código para abrir la ficha del producto.',
            hero_eyebrow: 'Base mundial de cosméticos halal',
            hero_title: 'La guía digital para elegir cuidados halal seguros y éticos.',
            hero_subtitle: 'Analiza productos al instante, comprueba ingredientes sensibles y explora la mayor base colaborativa halal.',
            hero_cta_explore: 'Explorar productos',
            hero_cta_contribute: 'Contribuir ahora',
            hero_cta_app: '📱 App móvil',
            stats_products: 'Productos registrados',
            stats_contributors: 'Colaboradores activos',
            stats_countries: 'Países cubiertos',
            quick_catalogue_title: 'Catálogo',
            quick_catalogue_desc: 'Filtra por etiquetas halal, vegetariano o sin alcohol en segundos.',
            quick_catalogue_cta: 'Ver productos →',
            quick_engagements_title: 'Compromisos',
            quick_engagements_desc: 'Descubre nuestras herramientas de análisis y transparencia de datos.',
            quick_engagements_cta: 'Leer compromisos →',
            quick_community_title: 'Comunidad',
            quick_community_desc: 'Únete a los voluntarios que enriquecen la base cada día.',
            quick_community_cta: 'Conocer la comunidad →',
            filters_title: 'Catálogo halal',
            filters_desc: 'Elige tus criterios y encuentra cuidados adecuados al instante.',
            filter_vegan: '🌱 Vegano',
            filter_vegetarian: '🥗 Vegetariano',
            filter_alcoholfree: '🚫 Sin alcohol',
            family_eyebrow: 'Vidas reales',
            family_title: 'Familias que nos inspiran comparten sus rutinas halal.',
            family_desc: 'Estas fotos provienen de la comunidad Halal Open Beauty Facts.',
            insight_1_title: '🧪 Análisis detallado',
            insight_1_desc: 'Detección automática de alcoholes, gelatinas o derivados animales.',
            insight_2_title: '📷 Escáner móvil',
            insight_2_desc: 'Conecta la app oficial para escanear códigos y obtener veredictos al instante.',
            insight_3_title: '🤝 Datos abiertos',
            insight_3_desc: 'API pública, exportaciones CSV y widgets listos.',
            community_eyebrow: 'Comunidad global',
            community_title: 'Contribuye a la mayor base halal abierta.',
            community_desc: 'Fotografía, traduce y valida ingredientes para ayudar al mundo.',
            community_cta_primary: 'Añadir producto',
            community_cta_secondary: 'Descargar guía de voluntarios',
            community_card_text: 'productos halal añadidos en 30 días',
            app_title: 'Escanea en la tienda',
            app_desc: 'La app Open Beauty Facts verifica halal, INCI y alérgenos en tiempo real.',
            live_feed_eyebrow: 'Pulso comunitario',
            live_feed_title: 'Últimas contribuciones halal',
            live_feed_desc: 'Sigue en tiempo real los nuevos productos y correcciones del colectivo Halal Open Beauty Facts.',
            live_feed_refresh: '↻ Actualizar',
            live_feed_loading: 'Cargando el flujo...',
            live_feed_empty: 'Aún no hay contribuciones recientes.',
            legal_section_title: 'Aviso legal',
            legal_section_alert: '<strong>Importante:</strong> Halal Open Beauty Facts es un sitio ciudadano sobre cosméticos halal. No vendemos ni promocionamos productos.',
            legal_section_indep: 'Halal Open Beauty Facts es 100% independiente y no está ligado a ningún industrial.',
            legal_section_support: 'Para consultas contacta directamente con el servicio al cliente del fabricante indicado en el envase.',
            legal_section_owner: 'Responsable de publicación: Mustapha Zentar.',
            legal_section_contact: 'contact@halalopenbeautyfacts.org',
            legal_license_title: 'Licencia de uso de datos'
        }
    };

    const EXTRA_TRANSLATIONS = {
        fr: {
            stats_excluded: 'Produits exclus',
            nav_back_home: 'Retour accueil',
            nav_back: 'Retour',
            nav_back_catalog: '← Retour au catalogue',
            footer_project_title: 'Projet',
            footer_project_legal: 'Mentions légales',
            footer_project_finance: 'Transparence financière',
            footer_project_press: 'Contact presse',
            footer_discover_title: 'Découvrir',
            footer_discover_catalog: 'Catalogue',
            footer_discover_commitments: 'Engagements',
            footer_discover_community: 'Communauté',
            footer_contribute_title: 'Contribuer',
            footer_contribute_add: 'Ajouter un produit',
            footer_contribute_translate: 'Traduire',
            footer_contribute_donate: 'Faire un don',
            footer_follow_title: 'Suivez-nous',
            footer_social_facebook: '🔵 Facebook',
            footer_social_twitter: '🐦 Twitter',
            footer_social_instagram: '📸 Instagram',
            footer_social_linkedin: '💼 LinkedIn',
            footer_copy_full: '© 2025 Halal Open Beauty Facts · Données ouvertes sous ODbL.',
            footer_copy_short: '© 2025 Halal Open Beauty Facts · Merci à la communauté mondiale.',
            country_badge_global: '🌍 Monde',
            country_message_global: 'Vue mondiale : contributions de tous les pays.',
            country_message_template: 'Vue locale : focus sur %COUNTRY%.',
            add_intro_badge: '🧾 Ajout via API officielle',
            add_intro_title: 'Ajouter un produit halal',
            add_intro_desc: 'Renseignez les informations présentes sur l’emballage. Les données sont envoyées directement vers l’API officielle Open Beauty Facts.',
            add_form_code_label: 'Code-barres *',
            add_form_code_placeholder: 'Ex : 3274080005003',
            add_form_code_helper: 'Sans espace ni caractère spécial.',
            add_form_name_label: 'Nom du produit *',
            add_form_brands_label: 'Marque',
            add_form_brands_placeholder: 'Ex : Inaya',
            add_form_quantity_label: 'Contenance',
            add_form_quantity_placeholder: '50 ml',
            add_form_labels_label: 'Labels',
            add_form_labels_placeholder: 'halal, vegan, alcohol-free',
            add_form_countries_label: 'Pays de vente',
            add_form_countries_placeholder: 'France, Maroc',
            add_form_lang_label: 'Langue principale *',
            add_form_lang_option_fr: 'Français',
            add_form_lang_option_en: 'Anglais',
            add_form_lang_option_ar: 'Arabe',
            add_form_lang_option_es: 'Espagnol',
            add_form_lang_option_pt: 'Portugais',
            add_form_lang_option_he: 'Hébreu',
            add_form_ingredients_label: 'Ingrédients',
            add_form_ingredients_placeholder: 'Liste INCI complète',
            add_form_user_label: 'Identifiant Open Beauty Facts *',
            add_form_user_helper: 'Le même que sur openbeautyfacts.org',
            add_form_password_label: 'Mot de passe *',
            add_form_password_helper: 'Nous ne le stockons pas. Il est chiffré et envoyé à l’API.',
            add_form_submit: 'Publier le produit',
            add_form_footer: 'Les données soumises sont publiées sous Open Database License. Merci pour votre contribution !',
            add_sidebar_title: 'Besoin d’aide ?',
            add_sidebar_doc: 'Consultez la documentation producteur pour découvrir toutes les options disponibles (photos, INCI, ingrédients détaillés...).',
            add_sidebar_tip_required: '✅ Champs obligatoires : code-barres, nom, langue, identifiants.',
            add_sidebar_tip_photos: '📸 Ajoutez ensuite les photos depuis l’application mobile.',
            add_sidebar_tip_support: '💌 Assistance : contact@halalopenbeautyfacts.org',
            product_loading: 'Chargement de la fiche produit...',
            product_app_title: 'Scannez et complétez les fiches',
            product_app_desc: 'L’application officielle vous permet d’ajouter des photos, traductions et vérifications halal (INCI) en direct.',
            product_app_apk: '⬇️ Télécharger l’APK Android',
            signin_strip_badge: '🔐 Accès contributeur',
            signin_strip_notice: 'Votre compte Open Beauty Facts fonctionne ici.',
            signin_card_badge: 'Compte Open Beauty Facts',
            signin_card_title: 'Se connecter',
            signin_card_desc: 'Vous serez redirigé vers l’espace officiel pour valider votre session.',
            signin_user_label: 'Identifiant',
            signin_password_label: 'Mot de passe',
            signin_submit: 'Se connecter via Open Beauty Facts',
            signin_footer_links: '<a href="signup.html">Créer un compte Halal</a> · <a href="https://world.openbeautyfacts.org/cgi/reset_password.pl" target="_blank" rel="noopener">Mot de passe oublié</a>',
            signin_aside_title: 'Pourquoi un compte ? ',
            signin_aside_desc1: 'Il vous permet d’ajouter des produits, valider les ingrédients sensibles et suivre vos contributions.',
            signin_aside_desc2: 'La même identité fonctionne sur Open Beauty Facts et Halal Open Beauty Facts.',
            signin_aside_cta: 'Découvrir la communauté →',
            legal_intro_block: `<span class="legal-highlight legal-highlight--title">Mentions légales</span>
<p class="legal-highlight legal-highlight--alert"><strong>Important :</strong> Halal Open Beauty Facts est un site citoyen d'information sur les cosmétiques halal. Nous ne vendons aucun produit et ne faisons la promotion d'aucune marque.</p>
<p class="legal-highlight legal-highlight--trust">Halal Open Beauty Facts est 100% indépendant, sans lien avec un industriel, un distributeur ou un acteur de la filière Halal.</p>
<p class="legal-highlight legal-highlight--support">Pour toute question ou réclamation sur un produit, contactez directement le service clients indiqué sur l'emballage.</p>
<a class="legal-mail legal-highlight legal-highlight--contact" href="mailto:contact@halalopenbeautyfacts.org">contact@halalopenbeautyfacts.org</a>
<div class="legal-data-block">
    <p class="legal-highlight legal-highlight--data">Licences d'utilisation des données cosmétiques halal</p>
    <ul>
        <li>Open Database License (ODbL)</li>
        <li>Database Contents License</li>
        <li>Creative Commons Attribution-ShareAlike</li>
    </ul>
</div>`,
            legal_publication_block: `<h2>Responsable de publication</h2>
<p>Association loi 1901 Halal Open Beauty Facts.</p>
<p>Siège : 21 rue des Bluets, 75011 Paris.</p>
<p>Directeur de publication : l'équipe Halal Open Beauty Facts.</p>`,
            legal_hosting_block: `<h2>Hébergement</h2>
<p>OVH SAS - 2 rue Kellermann - 59100 Roubaix - France.</p>
<p>Infrastructure redondée dans l'Union Européenne.</p>`,
            legal_privacy_block: `<h2>Protection des données</h2>
<ul>
    <li>Aucune donnée personnelle n'est vendue ni cédée.</li>
    <li>Les comptes contributeurs sont gérés sur openbeautyfacts.org.</li>
    <li>Droit d'accès / rectification : <a href="mailto:privacy@openfoodfacts.org">privacy@openfoodfacts.org</a></li>
</ul>`,
            legal_license_block: `<h2>Licence des données</h2>
<p>Open Database License (ODbL).</p>
<p>Database Contents License.</p>
<p>Licence Creative Commons Attribution-ShareAlike pour les contenus rédactionnels.</p>`,
            legal_trademarks_block: `<h2>Utilisation des marques</h2>
<p>Les logos et produits présents sur le site restent la propriété de leurs détenteurs.</p>
<p>Pour toute demande de retrait, écrivez à <a href="mailto:brands@openfoodfacts.org">brands@openfoodfacts.org</a>.</p>`,
            legal_reporting_block: `<h2>Signalement</h2>
<p>Vous constatez une erreur ou un produit non conforme ?</p>
<ul>
    <li>Utilisez le bouton « Signaler » dans l'application.</li>
    <li>Ou envoyez-nous la fiche produit concernée par e-mail.</li>
</ul>`,
            terms_content: `<h1>Conditions d'utilisation</h1>
<p>Ces conditions décrivent comment consulter, contribuer et réutiliser les données publiées sur Halal Open Beauty Facts.</p>
<section>
    <h2>1. Esprit communautaire</h2>
    <p>Le site est animé par des bénévoles. En contribuant, vous acceptez que vos ajouts soient revus, adaptés ou supprimés pour garantir la qualité des informations.</p>
</section>
<section>
    <h2>2. Réutilisation des données</h2>
    <p>Les données sont fournies sous licence Open Database License (ODbL). Toute réutilisation doit citer Halal Open Beauty Facts, partager les améliorations à l'identique et respecter les lois locales.</p>
</section>
<section>
    <h2>3. Responsabilités</h2>
    <p>Les informations sont fournies « en l'état ». Chaque utilisateur reste responsable de vérifier la conformité finale d'un produit et de se rapprocher des fabricants.</p>
</section>
<section>
    <h2>4. Contact</h2>
    <p>Pour toute question relative aux conditions d'utilisation, écrivez à <a href="mailto:contact@halalopenbeautyfacts.org">contact@halalopenbeautyfacts.org</a>.</p>
</section>
<p>Dernière mise à jour : 1er janvier 2026.</p>`
        },
        en: {
            stats_excluded: 'Excluded products',
            nav_back_home: 'Back to home',
            nav_back: 'Back',
            nav_back_catalog: '← Back to catalog',
            footer_project_title: 'Project',
            footer_project_legal: 'Legal notice',
            footer_project_finance: 'Financial transparency',
            footer_project_press: 'Press contact',
            footer_discover_title: 'Discover',
            footer_discover_catalog: 'Catalog',
            footer_discover_commitments: 'Commitments',
            footer_discover_community: 'Community',
            footer_contribute_title: 'Contribute',
            footer_contribute_add: 'Add a product',
            footer_contribute_translate: 'Translate',
            footer_contribute_donate: 'Donate',
            footer_follow_title: 'Follow us',
            footer_social_facebook: '🔵 Facebook',
            footer_social_twitter: '🐦 Twitter',
            footer_social_instagram: '📸 Instagram',
            footer_social_linkedin: '💼 LinkedIn',
            footer_copy_full: '© 2025 Halal Open Beauty Facts · Open Database License.',
            footer_copy_short: '© 2025 Halal Open Beauty Facts · Thanks to the global community.',
            country_badge_global: '🌍 World',
            country_message_global: 'Global view: contributions from every country.',
            country_message_template: 'Local view: spotlight on %COUNTRY%.',
            add_intro_badge: '🧾 Official API submission',
            add_intro_title: 'Add a halal cosmetic',
            add_intro_desc: 'Fill in the packaging information. The data is sent straight to the official Open Beauty Facts API.',
            add_form_code_label: 'Barcode *',
            add_form_code_placeholder: 'Ex: 3274080005003',
            add_form_code_helper: 'No spaces or special characters.',
            add_form_name_label: 'Product name *',
            add_form_brands_label: 'Brand',
            add_form_brands_placeholder: 'Ex: Inaya',
            add_form_quantity_label: 'Content',
            add_form_quantity_placeholder: '50 ml',
            add_form_labels_label: 'Labels',
            add_form_labels_placeholder: 'halal, vegan, alcohol-free',
            add_form_countries_label: 'Countries of sale',
            add_form_countries_placeholder: 'France, Morocco',
            add_form_lang_label: 'Main language *',
            add_form_lang_option_fr: 'French',
            add_form_lang_option_en: 'English',
            add_form_lang_option_ar: 'Arabic',
            add_form_lang_option_es: 'Spanish',
            add_form_lang_option_pt: 'Portuguese',
            add_form_lang_option_he: 'Hebrew',
            add_form_ingredients_label: 'Ingredients',
            add_form_ingredients_placeholder: 'Full INCI list',
            add_form_user_label: 'Open Beauty Facts ID *',
            add_form_user_helper: 'Same as on openbeautyfacts.org',
            add_form_password_label: 'Password *',
            add_form_password_helper: 'We never store it. It is encrypted and sent to the API.',
            add_form_submit: 'Publish the product',
            add_form_footer: 'Submitted data is published under the Open Database License. Thank you for contributing!',
            add_sidebar_title: 'Need help?',
            add_sidebar_doc: 'Check the producer documentation to discover every available option (photos, INCI, detailed ingredients, ...).',
            add_sidebar_tip_required: '✅ Required fields: barcode, name, language, credentials.',
            add_sidebar_tip_photos: '📸 Add photos later from the mobile app.',
            add_sidebar_tip_support: '💌 Support: contact@halalopenbeautyfacts.org',
            product_loading: 'Loading product sheet...',
            product_app_title: 'Scan and enrich the cards',
            product_app_desc: 'The official app lets you add photos, translations and halal / INCI checks instantly.',
            product_app_apk: '⬇️ Download the Android APK',
            signin_strip_badge: '🔐 Contributor access',
            signin_strip_notice: 'Your Open Beauty Facts account works here.',
            signin_card_badge: 'Open Beauty Facts account',
            signin_card_title: 'Sign in',
            signin_card_desc: 'You will be redirected to the official portal to validate your session.',
            signin_user_label: 'Username',
            signin_password_label: 'Password',
            signin_submit: 'Sign in via Open Beauty Facts',
            signin_footer_links: '<a href="signup.html">Create a Halal account</a> · <a href="https://world.openbeautyfacts.org/cgi/reset_password.pl" target="_blank" rel="noopener">Forgot password</a>',
            signin_aside_title: 'Why an account?',
            signin_aside_desc1: 'It lets you add products, validate sensitive ingredients and track your contributions.',
            signin_aside_desc2: 'The same identity works on Open Beauty Facts and Halal Open Beauty Facts.',
            signin_aside_cta: 'Meet the community →',
            legal_intro_block: `<span class="legal-highlight legal-highlight--title">Legal notice</span>
<p class="legal-highlight legal-highlight--alert"><strong>Important:</strong> Halal Open Beauty Facts is a civic website about halal cosmetics. We do not sell or promote any brand.</p>
<p class="legal-highlight legal-highlight--trust">Halal Open Beauty Facts is 100% independent and not tied to any manufacturer, retailer or halal actor.</p>
<p class="legal-highlight legal-highlight--support">For any question about a cosmetic, contact the customer service listed on the packaging.</p>
<a class="legal-mail legal-highlight legal-highlight--contact" href="mailto:contact@halalopenbeautyfacts.org">contact@halalopenbeautyfacts.org</a>
<div class="legal-data-block">
    <p class="legal-highlight legal-highlight--data">Data licenses for halal cosmetics</p>
    <ul>
        <li>Open Database License (ODbL)</li>
        <li>Database Contents License</li>
        <li>Creative Commons Attribution-ShareAlike</li>
    </ul>
</div>`,
            legal_publication_block: `<h2>Publication manager</h2>
<p>Non-profit association Halal Open Beauty Facts.</p>
<p>Head office: 21 rue des Bluets, 75011 Paris.</p>
<p>Editorial director: the Halal Open Beauty Facts team.</p>`,
            legal_hosting_block: `<h2>Hosting</h2>
<p>OVH SAS - 2 rue Kellermann - 59100 Roubaix - France.</p>
<p>Redundant infrastructure within the European Union.</p>`,
            legal_privacy_block: `<h2>Data protection</h2>
<ul>
    <li>No personal data is sold or transferred.</li>
    <li>Contributor accounts are managed on openbeautyfacts.org.</li>
    <li>Access / rectification: <a href="mailto:privacy@openfoodfacts.org">privacy@openfoodfacts.org</a></li>
</ul>`,
            legal_license_block: `<h2>Data licenses</h2>
<p>Open Database License (ODbL).</p>
<p>Database Contents License.</p>
<p>Creative Commons Attribution-ShareAlike for editorial content.</p>`,
            legal_trademarks_block: `<h2>Brands usage</h2>
<p>Logos and products remain the property of their respective owners.</p>
<p>For removal requests, email <a href="mailto:brands@openfoodfacts.org">brands@openfoodfacts.org</a>.</p>`,
            legal_reporting_block: `<h2>Reporting issues</h2>
<p>Did you spot an error or a non-compliant cosmetic?</p>
<ul>
    <li>Use the “Report” button in the app.</li>
    <li>Or send us the product sheet by email.</li>
</ul>`,
            terms_content: `<h1>Terms of use</h1>
<p>These terms explain how you may consult, contribute to and reuse the data published on Halal Open Beauty Facts.</p>
<section>
    <h2>1. Community spirit</h2>
    <p>The project is run by volunteers. By contributing you agree that your edits may be reviewed, adjusted or removed to guarantee information quality.</p>
</section>
<section>
    <h2>2. Data reuse</h2>
    <p>Data is provided under the Open Database License (ODbL). Any reuse must credit Halal Open Beauty Facts, share improvements alike and comply with local laws.</p>
</section>
<section>
    <h2>3. Responsibilities</h2>
    <p>Information is provided “as is”. Each user remains responsible for verifying final compliance and contacting manufacturers for official statements.</p>
</section>
<section>
    <h2>4. Contact</h2>
    <p>For any question about these terms, write to <a href="mailto:contact@halalopenbeautyfacts.org">contact@halalopenbeautyfacts.org</a>.</p>
</section>
<p>Last update: 1 January 2026.</p>`
        },
        ar: {
            stats_excluded: 'منتجات مستبعدة',
            nav_back_home: 'عودة إلى الصفحة الرئيسية',
            nav_back: 'عودة',
            nav_back_catalog: '← عودة إلى الفهرس',
            footer_project_title: 'المشروع',
            footer_project_legal: 'الشروط القانونية',
            footer_project_finance: 'الشفافية المالية',
            footer_project_press: 'التواصل الصحفي',
            footer_discover_title: 'اكتشف',
            footer_discover_catalog: 'الفهرس',
            footer_discover_commitments: 'الالتزامات',
            footer_discover_community: 'المجتمع',
            footer_contribute_title: 'ساهم',
            footer_contribute_add: 'أضف منتجًا',
            footer_contribute_translate: 'ترجم',
            footer_contribute_donate: 'تبرع',
            footer_follow_title: 'تابعنا',
            footer_social_facebook: '🔵 فيسبوك',
            footer_social_twitter: '🐦 تويتر',
            footer_social_instagram: '📸 إنستغرام',
            footer_social_linkedin: '💼 لينكدإن',
            footer_copy_full: '© 2025 Halal Open Beauty Facts · رخصة قاعدة البيانات المفتوحة.',
            footer_copy_short: '© 2025 Halal Open Beauty Facts · شكرًا للمجتمع العالمي.',
            country_badge_global: '🌍 العالم',
            country_message_global: 'عرض عالمي: مساهمات من كل البلدان.',
            country_message_template: 'عرض محلي: تركيز على %COUNTRY%.',
            add_intro_badge: '🧾 إرسال رسمي عبر الواجهة البرمجية',
            add_intro_title: 'أضف منتج تجميل حلال',
            add_intro_desc: 'أدخل المعلومات المكتوبة على العبوة. يتم إرسال البيانات مباشرة إلى واجهة Open Beauty Facts الرسمية.',
            add_form_code_label: 'الباركود *',
            add_form_code_placeholder: 'مثال: 3274080005003',
            add_form_code_helper: 'بدون فراغات أو رموز خاصة.',
            add_form_name_label: 'اسم المنتج *',
            add_form_brands_label: 'العلامة',
            add_form_brands_placeholder: 'مثال: Inaya',
            add_form_quantity_label: 'السعة',
            add_form_quantity_placeholder: '50 مل',
            add_form_labels_label: 'الوسوم',
            add_form_labels_placeholder: 'halal, vegan, alcohol-free',
            add_form_countries_label: 'بلدان البيع',
            add_form_countries_placeholder: 'فرنسا، المغرب',
            add_form_lang_label: 'اللغة الأساسية *',
            add_form_lang_option_fr: 'الفرنسية',
            add_form_lang_option_en: 'الإنجليزية',
            add_form_lang_option_ar: 'العربية',
            add_form_lang_option_es: 'الإسبانية',
            add_form_lang_option_pt: 'البرتغالية',
            add_form_lang_option_he: 'العبرية',
            add_form_ingredients_label: 'المكونات',
            add_form_ingredients_placeholder: 'قائمة INCI الكاملة',
            add_form_user_label: 'معرّف Open Beauty Facts *',
            add_form_user_helper: 'نفس الحساب على openbeautyfacts.org',
            add_form_password_label: 'كلمة المرور *',
            add_form_password_helper: 'لا نقوم بتخزينها. يتم تشفيرها وإرسالها إلى الواجهة.',
            add_form_submit: 'نشر المنتج',
            add_form_footer: 'يتم نشر البيانات تحت رخصة Open Database. شكرًا لمساهمتك!',
            add_sidebar_title: 'بحاجة إلى مساعدة؟',
            add_sidebar_doc: 'اطلع على وثائق المنتج لمعرفة كل الخيارات (الصور، INCI، المكونات التفصيلية...).',
            add_sidebar_tip_required: '✅ الحقول الإلزامية: الباركود، الاسم، اللغة، بيانات الدخول.',
            add_sidebar_tip_photos: '📸 أضف الصور لاحقًا من التطبيق.',
            add_sidebar_tip_support: '💌 دعم: contact@halalopenbeautyfacts.org',
            product_loading: 'جاري تحميل بطاقة المنتج...',
            product_app_title: 'امسح وأكمل البطاقات',
            product_app_desc: 'يتيح لك التطبيق الرسمي إضافة الصور والترجمات وفحوصات الحلال/INCI فورًا.',
            product_app_apk: '⬇️ تحميل ملف APK للأندرويد',
            signin_strip_badge: '🔐 دخول المتطوعين',
            signin_strip_notice: 'يعمل حساب Open Beauty Facts هنا.',
            signin_card_badge: 'حساب Open Beauty Facts',
            signin_card_title: 'تسجيل الدخول',
            signin_card_desc: 'ستتم إعادة توجيهك إلى البوابة الرسمية لتأكيد الجلسة.',
            signin_user_label: 'اسم المستخدم',
            signin_password_label: 'كلمة المرور',
            signin_submit: 'تسجيل الدخول عبر Open Beauty Facts',
            signin_footer_links: '<a href="signup.html">إنشاء حساب حلال</a> · <a href="https://world.openbeautyfacts.org/cgi/reset_password.pl" target="_blank" rel="noopener">نسيت كلمة المرور</a>',
            signin_aside_title: 'لماذا الحساب؟',
            signin_aside_desc1: 'يمكنك من إضافة المنتجات، التحقق من المكونات الحساسة وتتبع مساهماتك.',
            signin_aside_desc2: 'نفس الهوية تعمل على Open Beauty Facts و Halal Open Beauty Facts.',
            signin_aside_cta: 'تعرف على المجتمع →',
            legal_intro_block: `<span class="legal-highlight legal-highlight--title">الإشعار القانوني</span>
<p class="legal-highlight legal-highlight--alert"><strong>مهم:</strong> Halal Open Beauty Facts موقع مجتمعي حول مستحضرات التجميل الحلال. لا نبيع أو نروج لأي منتج.</p>
<p class="legal-highlight legal-highlight--trust">المشروع مستقل تمامًا وغير مرتبط بأي مصنع أو موزع.</p>
<p class="legal-highlight legal-highlight--support">لاستفسارات المنتجات يرجى التواصل مع خدمة العملاء المذكورة على العبوة.</p>
<a class="legal-mail legal-highlight legal-highlight--contact" href="mailto:contact@halalopenbeautyfacts.org">contact@halalopenbeautyfacts.org</a>
<div class="legal-data-block">
    <p class="legal-highlight legal-highlight--data">تراخيص بيانات مستحضرات التجميل الحلال</p>
    <ul>
        <li>Open Database License (ODbL)</li>
        <li>Database Contents License</li>
        <li>Creative Commons Attribution-ShareAlike</li>
    </ul>
</div>`,
            legal_publication_block: `<h2>مسؤول النشر</h2>
<p>جمعية Halal Open Beauty Facts وفق قانون 1901.</p>
<p>المقر: 21 شارع بلوى، 75011 باريس.</p>
<p>مدير النشر: فريق Halal Open Beauty Facts.</p>`,
            legal_hosting_block: `<h2>الاستضافة</h2>
<p>OVH SAS - 2 rue Kellermann - 59100 Roubaix - France.</p>
<p>بنية احتياطية داخل الاتحاد الأوروبي.</p>`,
            legal_privacy_block: `<h2>حماية البيانات</h2>
<ul>
    <li>لا يتم بيع أو مشاركة أي بيانات شخصية.</li>
    <li>تُدار حسابات المساهمين عبر openbeautyfacts.org.</li>
    <li>حق الوصول / التعديل: <a href="mailto:privacy@openfoodfacts.org">privacy@openfoodfacts.org</a></li>
</ul>`,
            legal_license_block: `<h2>تراخيص البيانات</h2>
<p>Open Database License (ODbL).</p>
<p>Database Contents License.</p>
<p>رخصة Creative Commons Attribution-ShareAlike للمحتوى التحريري.</p>`,
            legal_trademarks_block: `<h2>استخدام العلامات التجارية</h2>
<p>تبقى الشعارات والمنتجات ملكًا لأصحابها.</p>
<p>لطلب الإزالة، راسل <a href="mailto:brands@openfoodfacts.org">brands@openfoodfacts.org</a>.</p>`,
            legal_reporting_block: `<h2>الإبلاغ</h2>
<p>هل لاحظت خطأ أو منتجًا غير مطابق؟</p>
<ul>
    <li>استخدم زر «الإبلاغ» داخل التطبيق.</li>
    <li>أو أرسل لنا بطاقة المنتج عبر البريد الإلكتروني.</li>
</ul>`,
            terms_content: `<h1>شروط الاستخدام</h1>
<p>توضح هذه الشروط كيفية تصفح البيانات والمساهمة فيها وإعادة استخدامها على Halal Open Beauty Facts.</p>
<section>
    <h2>1. روح المجتمع</h2>
    <p>يدير المتطوعون الموقع. بمساهمتك فإنك توافق على مراجعة أو تعديل أو حذف مساهماتك لضمان جودة المعلومات.</p>
</section>
<section>
    <h2>2. إعادة استخدام البيانات</h2>
    <p>تتوفر البيانات بموجب رخصة Open Database (ODbL). يجب ذكر Halal Open Beauty Facts، ومشاركة التحسينات بالرخصة نفسها، والامتثال للقوانين المحلية.</p>
</section>
<section>
    <h2>3. المسؤوليات</h2>
    <p>تُقدّم المعلومات «كما هي». على كل مستخدم التحقق النهائي من مطابقة المنتج والتواصل مع الشركات للمعلومات الرسمية.</p>
</section>
<section>
    <h2>4. الاتصال</h2>
    <p>لأي استفسار حول الشروط، راسل <a href="mailto:contact@halalopenbeautyfacts.org">contact@halalopenbeautyfacts.org</a>.</p>
</section>
<p>آخر تحديث: 1 يناير 2026.</p>`
        },
        es: {
            stats_excluded: 'Productos excluidos',
            nav_back_home: 'Volver al inicio',
            nav_back: 'Volver',
            nav_back_catalog: '← Volver al catálogo',
            footer_project_title: 'Proyecto',
            footer_project_legal: 'Aviso legal',
            footer_project_finance: 'Transparencia financiera',
            footer_project_press: 'Contacto prensa',
            footer_discover_title: 'Descubrir',
            footer_discover_catalog: 'Catálogo',
            footer_discover_commitments: 'Compromisos',
            footer_discover_community: 'Comunidad',
            footer_contribute_title: 'Contribuir',
            footer_contribute_add: 'Añadir producto',
            footer_contribute_translate: 'Traducir',
            footer_contribute_donate: 'Donar',
            footer_follow_title: 'Síguenos',
            footer_social_facebook: '🔵 Facebook',
            footer_social_twitter: '🐦 Twitter',
            footer_social_instagram: '📸 Instagram',
            footer_social_linkedin: '💼 LinkedIn',
            footer_copy_full: '© 2025 Halal Open Beauty Facts · Licencia Open Database.',
            footer_copy_short: '© 2025 Halal Open Beauty Facts · Gracias a la comunidad global.',
            country_badge_global: '🌍 Mundo',
            country_message_global: 'Vista global: contribuciones de todos los países.',
            country_message_template: 'Vista local: enfoque en %COUNTRY%.',
            add_intro_badge: '🧾 Alta mediante API oficial',
            add_intro_title: 'Agregar un cosmético halal',
            add_intro_desc: 'Completa la información del envase. Los datos se envían directamente a la API oficial de Open Beauty Facts.',
            add_form_code_label: 'Código de barras *',
            add_form_code_placeholder: 'Ej: 3274080005003',
            add_form_code_helper: 'Sin espacios ni caracteres especiales.',
            add_form_name_label: 'Nombre del producto *',
            add_form_brands_label: 'Marca',
            add_form_brands_placeholder: 'Ej: Inaya',
            add_form_quantity_label: 'Contenido',
            add_form_quantity_placeholder: '50 ml',
            add_form_labels_label: 'Etiquetas',
            add_form_labels_placeholder: 'halal, vegano, sin alcohol',
            add_form_countries_label: 'Países de venta',
            add_form_countries_placeholder: 'Francia, Marruecos',
            add_form_lang_label: 'Idioma principal *',
            add_form_lang_option_fr: 'Francés',
            add_form_lang_option_en: 'Inglés',
            add_form_lang_option_ar: 'Árabe',
            add_form_lang_option_es: 'Español',
            add_form_lang_option_pt: 'Portugués',
            add_form_lang_option_he: 'Hebreo',
            add_form_ingredients_label: 'Ingredientes',
            add_form_ingredients_placeholder: 'Lista INCI completa',
            add_form_user_label: 'ID de Open Beauty Facts *',
            add_form_user_helper: 'El mismo que en openbeautyfacts.org',
            add_form_password_label: 'Contraseña *',
            add_form_password_helper: 'No la almacenamos. Se cifra y envía a la API.',
            add_form_submit: 'Publicar producto',
            add_form_footer: 'Los datos enviados se publican bajo Open Database License. ¡Gracias por tu ayuda!',
            add_sidebar_title: '¿Necesitas ayuda?',
            add_sidebar_doc: 'Consulta la documentación para productores y descubre todas las opciones (fotos, INCI, ingredientes detallados...).',
            add_sidebar_tip_required: '✅ Campos obligatorios: código de barras, nombre, idioma, credenciales.',
            add_sidebar_tip_photos: '📸 Añade las fotos después desde la app móvil.',
            add_sidebar_tip_support: '💌 Soporte: contact@halalopenbeautyfacts.org',
            product_loading: 'Cargando ficha del producto...',
            product_app_title: 'Escanea y completa fichas',
            product_app_desc: 'La app oficial te permite añadir fotos, traducciones y verificaciones halal/INCI al instante.',
            product_app_apk: '⬇️ Descargar APK de Android',
            signin_strip_badge: '🔐 Acceso contribuidor',
            signin_strip_notice: 'Tu cuenta Open Beauty Facts funciona aquí.',
            signin_card_badge: 'Cuenta Open Beauty Facts',
            signin_card_title: 'Iniciar sesión',
            signin_card_desc: 'Serás redirigido al portal oficial para validar tu sesión.',
            signin_user_label: 'Usuario',
            signin_password_label: 'Contraseña',
            signin_submit: 'Entrar con Open Beauty Facts',
            signin_footer_links: '<a href="signup.html">Crear cuenta Halal</a> · <a href="https://world.openbeautyfacts.org/cgi/reset_password.pl" target="_blank" rel="noopener">Olvidé mi contraseña</a>',
            signin_aside_title: '¿Por qué una cuenta?',
            signin_aside_desc1: 'Te permite añadir productos, validar ingredientes sensibles y seguir tus aportes.',
            signin_aside_desc2: 'La misma identidad funciona en Open Beauty Facts y Halal Open Beauty Facts.',
            signin_aside_cta: 'Conocer a la comunidad →',
            legal_intro_block: `<span class="legal-highlight legal-highlight--title">Aviso legal</span>
<p class="legal-highlight legal-highlight--alert"><strong>Importante:</strong> Halal Open Beauty Facts es un sitio ciudadano sobre cosméticos halal. No vendemos ni promocionamos productos.</p>
<p class="legal-highlight legal-highlight--trust">El proyecto es 100% independiente y no está ligado a ningún fabricante.</p>
<p class="legal-highlight legal-highlight--support">Para consultas sobre un producto, contacta al servicio indicado en el envase.</p>
<a class="legal-mail legal-highlight legal-highlight--contact" href="mailto:contact@halalopenbeautyfacts.org">contact@halalopenbeautyfacts.org</a>
<div class="legal-data-block">
    <p class="legal-highlight legal-highlight--data">Licencias de datos para cosméticos halal</p>
    <ul>
        <li>Open Database License (ODbL)</li>
        <li>Database Contents License</li>
        <li>Creative Commons Attribution-ShareAlike</li>
    </ul>
</div>`,
            legal_publication_block: `<h2>Responsable de publicación</h2>
<p>Asociación Halal Open Beauty Facts (ley 1901).</p>
<p>Sede: 21 rue des Bluets, 75011 París.</p>
<p>Dirección editorial: equipo Halal Open Beauty Facts.</p>`,
            legal_hosting_block: `<h2>Alojamiento</h2>
<p>OVH SAS - 2 rue Kellermann - 59100 Roubaix - Francia.</p>
<p>Infraestructura redundante en la Unión Europea.</p>`,
            legal_privacy_block: `<h2>Protección de datos</h2>
<ul>
    <li>No se venden ni ceden datos personales.</li>
    <li>Las cuentas se gestionan en openbeautyfacts.org.</li>
    <li>Derecho de acceso / rectificación: <a href="mailto:privacy@openfoodfacts.org">privacy@openfoodfacts.org</a></li>
</ul>`,
            legal_license_block: `<h2>Licencia de datos</h2>
<p>Open Database License (ODbL).</p>
<p>Database Contents License.</p>
<p>Creative Commons Attribution-ShareAlike para los contenidos editoriales.</p>`,
            legal_trademarks_block: `<h2>Uso de marcas</h2>
<p>Los logos y productos siguen siendo propiedad de sus titulares.</p>
<p>Para solicitar una retirada, escribe a <a href="mailto:brands@openfoodfacts.org">brands@openfoodfacts.org</a>.</p>`,
            legal_reporting_block: `<h2>Notificaciones</h2>
<p>¿Has visto un error o un cosmético no conforme?</p>
<ul>
    <li>Usa el botón «Reportar» en la app.</li>
    <li>O envíanos la ficha correspondiente por correo.</li>
</ul>`,
            terms_content: `<h1>Condiciones de uso</h1>
<p>Estas condiciones describen cómo consultar, contribuir y reutilizar los datos publicados en Halal Open Beauty Facts.</p>
<section>
    <h2>1. Espíritu comunitario</h2>
    <p>El sitio es gestionado por voluntarios. Al contribuir aceptas que tus aportes puedan revisarse o ajustarse para garantizar la calidad de la información.</p>
</section>
<section>
    <h2>2. Reutilización de datos</h2>
    <p>Los datos se publican bajo licencia Open Database (ODbL). Debes mencionar Halal Open Beauty Facts, compartir las mejoras bajo la misma licencia y respetar las leyes locales.</p>
</section>
<section>
    <h2>3. Responsabilidades</h2>
    <p>La información se proporciona "tal cual". Cada usuario es responsable de verificar la conformidad final del cosmético y contactar al fabricante.</p>
</section>
<section>
    <h2>4. Contacto</h2>
    <p>Para dudas sobre las condiciones, escribe a <a href="mailto:contact@halalopenbeautyfacts.org">contact@halalopenbeautyfacts.org</a>.</p>
</section>
<p>Última actualización: 1 de enero de 2026.</p>`
        }
    };

    Object.entries(EXTRA_TRANSLATIONS).forEach(([lang, extra]) => {
        TRANSLATIONS[lang] = {
            ...(TRANSLATIONS[lang] || {}),
            ...extra
        };
    });

    const cloneTranslations = (sourceLang) => JSON.parse(JSON.stringify(TRANSLATIONS[sourceLang] || {}));
    TRANSLATIONS.pt = cloneTranslations('en');
    TRANSLATIONS.he = cloneTranslations('en');

    const RTL_LANGS = new Set(['ar', 'he']);

    const state = {
        language: 'fr',
        country: '',
        countryLabel: '',
        ready: false
    };

    const getQueryParam = (key) => new URLSearchParams(window.location.search).get(key);

    function updateQueryParam(key, value) {
        if (!window.history || typeof window.history.replaceState !== 'function') {
            return;
        }
        const url = new URL(window.location.href);
        if (!value) {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, value);
        }
        const nextUrl = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState(window.history.state || {}, '', nextUrl);
    }

    function resolveInitialLanguage() {
        return getQueryParam('lang') || localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'fr';
    }

    function resolveInitialCountry() {
        // IMPORTANT: Par défaut, afficher le monde entier (base de données globale)
        // Ne jamais filtrer automatiquement par pays sauf si explicitement demandé
        const queryCountry = getQueryParam('country');
        const storedCountry = localStorage.getItem(COUNTRY_STORAGE_KEY);
        
        console.log('[LOCALE] resolveInitialCountry - queryCountry:', queryCountry);
        console.log('[LOCALE] resolveInitialCountry - storedCountry:', storedCountry);
        
        // Si pas de paramètre URL, toujours retourner '' (monde entier)
        // Ignorer le localStorage pour forcer l'affichage mondial par défaut
        const finalCountry = queryCountry || '';
        
        console.log('[LOCALE] resolveInitialCountry - finalCountry:', finalCountry);
        
        // Nettoyer le localStorage si contient France par défaut
        if (storedCountry && storedCountry !== '' && !queryCountry) {
            console.log('[LOCALE] Nettoyage localStorage - suppression filtre pays:', storedCountry);
            localStorage.removeItem(COUNTRY_STORAGE_KEY);
        }
        
        return finalCountry;
    }

    function populateSelect(select, options) {
        if (!select) return;
        select.innerHTML = '';
        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            select.appendChild(opt);
        });
    }

    function slugifyCountryId(id = '') {
        const clean = id.split(':').pop() || id;
        return clean.toLowerCase().replace(/_/g, '-');
    }

    function normalizeCountryTags(tags = []) {
        const seen = new Set();
        return tags
            .filter(tag => tag?.name && tag.id)
            .sort((a, b) => (b.products || 0) - (a.products || 0))
            .map(tag => {
                const value = slugifyCountryId(tag.id);
                if (seen.has(value)) {
                    return null;
                }
                seen.add(value);
                return { value, label: tag.name };
            })
            .filter(Boolean);
    }

    function hydrateCountries(select) {
        if (!select) {
            state.countryLabel = getCountryLabel(state.country);
            return Promise.resolve();
        }

        const resetWithPlaceholder = () => {
            select.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '🌍 World / Monde';
            select.appendChild(placeholder);
            rememberCountryLabel('', placeholder.textContent);
        };

        const appendOption = (value, label) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            select.appendChild(option);
            rememberCountryLabel(value, label);
        };

        const finalizeSelection = () => {
            select.value = state.country || '';
            state.countryLabel = getCountryLabel(state.country);
        };

        const fallback = () => {
            resetWithPlaceholder();
            SUPPORTED_COUNTRIES.forEach(({ value, label }) => {
                if (!value) {
                    return;
                }
                appendOption(value, label);
            });
            finalizeSelection();
        };

        const renderDataset = (dataset = []) => {
            resetWithPlaceholder();
            dataset.forEach(({ value, label }) => appendOption(value, label));
            finalizeSelection();
        };

        const cachedCountries = readCountryCache();

        resetWithPlaceholder();
        if (cachedCountries?.length) {
            cachedCountries.forEach(({ value, label }) => appendOption(value, label));
            finalizeSelection();
        }

        return fetch(COUNTRY_ENDPOINT)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Country request failed');
                }
                return response.json();
            })
            .then(data => {
                const tags = Array.isArray(data?.tags) ? data.tags : [];
                const normalized = normalizeCountryTags(tags);
                if (normalized.length) {
                    renderDataset(normalized);
                    writeCountryCache(normalized);
                    return;
                }
                if (!cachedCountries?.length) {
                    fallback();
                }
            })
            .catch(error => {
                console.warn('Unable to load countries from API, using fallback list', error);
                if (!cachedCountries?.length) {
                    fallback();
                } else {
                    finalizeSelection();
                }
            });
    }

    function applyTranslations(lang) {
        const dict = TRANSLATIONS[lang] || TRANSLATIONS.fr;
        document.documentElement.lang = lang;
        document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';

        document.querySelectorAll('[data-i18n]').forEach(node => {
            const key = node.dataset.i18n;
            if (!key || !(key in dict)) return;
            if (node.dataset.i18nHtml === 'true') {
                node.innerHTML = dict[key];
            } else {
                node.textContent = dict[key];
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
            const key = node.dataset.i18nPlaceholder;
            if (!key || !(key in dict)) return;
            node.setAttribute('placeholder', dict[key]);
        });

        document.querySelectorAll('[data-i18n-template]').forEach(node => {
            const key = node.dataset.i18nTemplate;
            if (!key || !(key in dict)) return;
            node.dataset.template = dict[key];
        });
    }

    function emit(eventName) {
        window.dispatchEvent(new CustomEvent(eventName, {
            detail: { language: state.language, country: state.country, countryLabel: state.countryLabel }
        }));
    }

    function attachSelectHandlers(countrySelect, languageSelect) {
        if (countrySelect) {
            countrySelect.value = state.country;
            countrySelect.addEventListener('change', () => {
                state.country = countrySelect.value;
                state.countryLabel = getCountryLabel(state.country);
                localStorage.setItem(COUNTRY_STORAGE_KEY, state.country);
                updateQueryParam('country', state.country);
                emit('locale:country-change');
            });
        }

        if (languageSelect) {
            languageSelect.value = state.language;
            languageSelect.addEventListener('change', () => {
                state.language = languageSelect.value || 'fr';
                localStorage.setItem(LANGUAGE_STORAGE_KEY, state.language);
                applyTranslations(state.language);
                updateQueryParam('lang', state.language);
                emit('locale:language-change');
            });
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        state.language = resolveInitialLanguage();
        state.country = resolveInitialCountry();

        const countrySelect = document.getElementById('country-select');
        const languageSelect = document.getElementById('language-select');

        await hydrateCountries(countrySelect);
        populateSelect(languageSelect, SUPPORTED_LANGUAGES);
        applyTranslations(state.language);
        attachSelectHandlers(countrySelect, languageSelect);

        window.LocaleState = {
            get language() { return state.language; },
            get country() { return state.country; },
            get countryLabel() { return state.countryLabel; },
            setLanguage: (lang) => {
                state.language = lang || 'fr';
                localStorage.setItem(LANGUAGE_STORAGE_KEY, state.language);
                applyTranslations(state.language);
                if (languageSelect) {
                    languageSelect.value = state.language;
                }
                updateQueryParam('lang', state.language);
                emit('locale:language-change');
            },
            setCountry: (country) => {
                state.country = country || '';
                state.countryLabel = getCountryLabel(state.country);
                localStorage.setItem(COUNTRY_STORAGE_KEY, state.country);
                if (countrySelect) {
                    countrySelect.value = state.country;
                }
                updateQueryParam('country', state.country);
                emit('locale:country-change');
            }
        };

        state.ready = true;
        emit('locale:ready');
    });
})();
