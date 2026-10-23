// Traductions de l'interface (fr par défaut, en / ar / es). Les contenus éditoriaux
// (guides, mentions légales, blog) restent en français : voir README « Langues ».

export const LANGS = ['fr', 'en', 'ar', 'es'];
const RTL = new Set(['ar']);

const DICT = {
    'skip': { fr: 'Aller au contenu', en: 'Skip to content', ar: 'انتقل إلى المحتوى', es: 'Ir al contenido' },
    'nav.home': { fr: 'Accueil', en: 'Home', ar: 'الرئيسية', es: 'Inicio' },
    'nav.search': { fr: 'Recherche', en: 'Search', ar: 'بحث', es: 'Buscar' },
    'nav.catalogue': { fr: 'Catalogue', en: 'Catalogue', ar: 'الكتالوج', es: 'Catálogo' },
    'nav.excluded': { fr: 'Non conformes', en: 'Non-compliant', ar: 'غير مطابقة', es: 'No conformes' },
    'nav.compare': { fr: 'Comparer', en: 'Compare', ar: 'قارن', es: 'Comparar' },
    'nav.learn': { fr: 'Apprendre', en: 'Learn', ar: 'تعلّم', es: 'Aprender' },
    'nav.blog': { fr: 'Blog', en: 'Blog', ar: 'المدونة', es: 'Blog' },
    'nav.community': { fr: 'Communauté', en: 'Community', ar: 'المجتمع', es: 'Comunidad' },
    'nav.dashboard': { fr: 'Statistiques', en: 'Statistics', ar: 'إحصائيات', es: 'Estadísticas' },
    'nav.lists': { fr: 'Mes listes', en: 'My lists', ar: 'قوائمي', es: 'Mis listas' },
    'nav.add': { fr: 'Contribuer', en: 'Contribute', ar: 'ساهم', es: 'Contribuir' },
    'nav.donate': { fr: 'Faire un don', en: 'Donate', ar: 'تبرّع', es: 'Donar' },
    'nav.membership': { fr: 'Adhérer', en: 'Join', ar: 'انضم', es: 'Afiliarse' },
    'support.badge': { fr: 'Association indépendante', en: 'Independent non-profit', ar: 'جمعية مستقلة', es: 'Asociación independiente' },
    'support.title': { fr: 'Ce site existe grâce à vous', en: 'This site exists thanks to you', ar: 'هذا الموقع موجود بفضلكم', es: 'Este sitio existe gracias a ti' },
    'support.text': { fr: 'Hébergement, vérification des données, outils libres : tout est financé par vos dons et vos adhésions.', en: 'Hosting, data checks, open-source tools: everything is funded by your donations and memberships.', ar: 'الاستضافة والتحقق من البيانات والأدوات الحرة: كل ذلك ممول بتبرعاتكم واشتراكاتكم.', es: 'Alojamiento, verificación de datos, herramientas libres: todo se financia con tus donaciones y afiliaciones.' },
    'support.join': { fr: 'Devenir adhérent', en: 'Become a member', ar: 'كن عضوًا', es: 'Hazte socio' },
    'nav.more': { fr: 'Plus', en: 'More', ar: 'المزيد', es: 'Más' },
    'menu.open': { fr: 'Ouvrir le menu', en: 'Open menu', ar: 'افتح القائمة', es: 'Abrir menú' },
    'menu.close': { fr: 'Fermer le menu', en: 'Close menu', ar: 'أغلق القائمة', es: 'Cerrar menú' },
    'lang.label': { fr: 'Langue', en: 'Language', ar: 'اللغة', es: 'Idioma' },
    'theme.toggle': { fr: 'Changer de thème', en: 'Toggle theme', ar: 'تغيير المظهر', es: 'Cambiar tema' },
    'theme.dark': { fr: 'Thème sombre activé', en: 'Dark theme on', ar: 'تم تفعيل الوضع الداكن', es: 'Tema oscuro activado' },
    'theme.light': { fr: 'Thème clair activé', en: 'Light theme on', ar: 'تم تفعيل الوضع الفاتح', es: 'Tema claro activado' },

    'common.close': { fr: 'Fermer', en: 'Close', ar: 'إغلاق', es: 'Cerrar' },
    'common.open': { fr: 'Ouvrir', en: 'Open', ar: 'فتح', es: 'Abrir' },
    'common.retry': { fr: 'Réessayer', en: 'Try again', ar: 'أعد المحاولة', es: 'Reintentar' },
    'common.seeAll': { fr: 'Tout voir', en: 'See all', ar: 'عرض الكل', es: 'Ver todo' },
    'common.loading': { fr: 'Chargement…', en: 'Loading…', ar: 'جارٍ التحميل…', es: 'Cargando…' },
    'common.back': { fr: 'Retour', en: 'Back', ar: 'رجوع', es: 'Volver' },
    'common.previous': { fr: 'Précédent', en: 'Previous', ar: 'السابق', es: 'Anterior' },
    'common.next': { fr: 'Suivant', en: 'Next', ar: 'التالي', es: 'Siguiente' },
    'common.page': { fr: 'Page', en: 'Page', ar: 'صفحة', es: 'Página' },
    'common.reset': { fr: 'Réinitialiser', en: 'Reset', ar: 'إعادة تعيين', es: 'Restablecer' },
    'common.apply': { fr: 'Afficher les résultats', en: 'Show results', ar: 'عرض النتائج', es: 'Ver resultados' },
    'common.offline': { fr: 'Vous êtes hors ligne : les pages déjà consultées restent disponibles.', en: 'You are offline: pages you visited remain available.', ar: 'أنت غير متصل: الصفحات التي زرتها تبقى متاحة.', es: 'Sin conexión: las páginas visitadas siguen disponibles.' },
    'common.online': { fr: 'Connexion rétablie', en: 'Back online', ar: 'عاد الاتصال', es: 'Conexión restablecida' },

    'search.label': { fr: 'Rechercher un produit', en: 'Search for a product', ar: 'ابحث عن منتج', es: 'Buscar un producto' },
    'search.placeholder': { fr: 'Nom, marque ou code-barres', en: 'Name, brand or barcode', ar: 'الاسم أو العلامة أو الرمز الشريطي', es: 'Nombre, marca o código de barras' },
    'search.submit': { fr: 'Rechercher', en: 'Search', ar: 'بحث', es: 'Buscar' },
    'search.clear': { fr: 'Effacer', en: 'Clear', ar: 'مسح', es: 'Borrar' },
    'search.noResult': { fr: 'Aucun produit trouvé.', en: 'No product found.', ar: 'لم يتم العثور على أي منتج.', es: 'No se encontró ningún producto.' },
    'search.seeAll': { fr: 'Voir tous les résultats', en: 'See all results', ar: 'عرض كل النتائج', es: 'Ver todos los resultados' },
    'search.openBarcode': { fr: 'Ouvrir la fiche du code-barres', en: 'Open barcode product', ar: 'افتح منتج الرمز الشريطي', es: 'Abrir producto del código' },
    'search.typing': { fr: 'Saisissez au moins 2 caractères', en: 'Type at least 2 characters', ar: 'اكتب حرفين على الأقل', es: 'Escribe al menos 2 caracteres' },

    'scan.cta': { fr: 'Scanner', en: 'Scan', ar: 'امسح', es: 'Escanear' },
    'scan.title': { fr: 'Scanner un code-barres', en: 'Scan a barcode', ar: 'امسح رمزًا شريطيًا', es: 'Escanear un código' },
    'scan.aim': { fr: 'Placez le code-barres dans le cadre', en: 'Place the barcode inside the frame', ar: 'ضع الرمز الشريطي داخل الإطار', es: 'Coloca el código dentro del marco' },
    'scan.manual': { fr: 'Ou saisissez le code-barres', en: 'Or type the barcode', ar: 'أو اكتب الرمز الشريطي', es: 'O escribe el código' },
    'scan.torch': { fr: 'Lampe', en: 'Torch', ar: 'مصباح', es: 'Linterna' },
    'scan.starting': { fr: 'Ouverture de la caméra…', en: 'Starting camera…', ar: 'جارٍ تشغيل الكاميرا…', es: 'Abriendo la cámara…' },
    'scan.denied': { fr: 'Accès à la caméra refusé. Autorisez-le dans les réglages du navigateur, ou saisissez le code ci-dessous.', en: 'Camera access denied. Allow it in your browser settings, or type the code below.', ar: 'تم رفض الوصول إلى الكاميرا. اسمح به في إعدادات المتصفح أو اكتب الرمز أدناه.', es: 'Acceso a la cámara denegado. Permítelo en el navegador o escribe el código abajo.' },
    'scan.unavailable': { fr: 'Aucune caméra disponible sur cet appareil. Saisissez le code-barres ci-dessous.', en: 'No camera available on this device. Type the barcode below.', ar: 'لا توجد كاميرا متاحة. اكتب الرمز الشريطي أدناه.', es: 'No hay cámara disponible. Escribe el código abajo.' },
    'scan.found': { fr: 'Code détecté', en: 'Code detected', ar: 'تم اكتشاف الرمز', es: 'Código detectado' },
    'scan.invalid': { fr: 'Code-barres invalide : 8 à 14 chiffres attendus.', en: 'Invalid barcode: 8 to 14 digits expected.', ar: 'رمز غير صالح: يلزم من 8 إلى 14 رقمًا.', es: 'Código no válido: se esperan de 8 a 14 dígitos.' },
    'scan.checksum': { fr: 'La clé de contrôle ne correspond pas : vérifiez les chiffres.', en: 'Check digit does not match: please check the digits.', ar: 'رقم التحقق غير مطابق: تحقق من الأرقام.', es: 'El dígito de control no coincide: revisa los números.' },
    'scan.notFound': { fr: 'Ce produit n\'est pas encore dans la base.', en: 'This product is not in the database yet.', ar: 'هذا المنتج غير موجود في القاعدة بعد.', es: 'Este producto aún no está en la base.' },
    'scan.again': { fr: 'Scanner un autre', en: 'Scan another', ar: 'امسح منتجًا آخر', es: 'Escanear otro' },
    'scan.view': { fr: 'Voir la fiche', en: 'View product', ar: 'عرض المنتج', es: 'Ver ficha' },
    'scan.add': { fr: 'Ajouter ce produit', en: 'Add this product', ar: 'أضف هذا المنتج', es: 'Añadir este producto' },

    'status.halal': { fr: 'Halal', en: 'Halal', ar: 'حلال', es: 'Halal' },
    'status.haram': { fr: 'Non conforme', en: 'Non-compliant', ar: 'غير مطابق', es: 'No conforme' },
    'status.doubtful': { fr: 'Douteux', en: 'Doubtful', ar: 'مشكوك فيه', es: 'Dudoso' },
    'status.unknown': { fr: 'Non renseigné', en: 'No information', ar: 'غير محدد', es: 'Sin información' },

    'filters.title': { fr: 'Filtres', en: 'Filters', ar: 'عوامل التصفية', es: 'Filtros' },
    'filters.status': { fr: 'Statut halal', en: 'Halal status', ar: 'حالة الحلال', es: 'Estado halal' },
    'filters.all': { fr: 'Tous les produits', en: 'All products', ar: 'كل المنتجات', es: 'Todos los productos' },
    'filters.labels': { fr: 'Labels', en: 'Labels', ar: 'الملصقات', es: 'Etiquetas' },
    'filters.category': { fr: 'Catégorie', en: 'Category', ar: 'الفئة', es: 'Categoría' },
    'filters.country': { fr: 'Pays de vente', en: 'Country of sale', ar: 'بلد البيع', es: 'País de venta' },
    'filters.anyCategory': { fr: 'Toutes les catégories', en: 'All categories', ar: 'كل الفئات', es: 'Todas las categorías' },
    'filters.anyCountry': { fr: 'Tous les pays', en: 'All countries', ar: 'كل البلدان', es: 'Todos los países' },
    'filters.palm': { fr: 'Sans huile de palme', en: 'Palm oil free', ar: 'بدون زيت النخيل', es: 'Sin aceite de palma' },
    'filters.sort': { fr: 'Trier par', en: 'Sort by', ar: 'رتّب حسب', es: 'Ordenar por' },
    'sort.popularity': { fr: 'Popularité', en: 'Popularity', ar: 'الشعبية', es: 'Popularidad' },
    'sort.recent': { fr: 'Mis à jour récemment', en: 'Recently updated', ar: 'المحدثة مؤخرًا', es: 'Actualizados recientemente' },
    'sort.name': { fr: 'Nom (A→Z)', en: 'Name (A→Z)', ar: 'الاسم (أ←ي)', es: 'Nombre (A→Z)' },
    'results.unit': { fr: 'produits', en: 'products', ar: 'منتجات', es: 'productos' },
    'results.one': { fr: 'produit', en: 'product', ar: 'منتج', es: 'producto' },
    'results.count': { fr: '{n} produits', en: '{n} products', ar: '{n} منتج', es: '{n} productos' },
    'results.countMore': { fr: 'plus de {n} produits', en: 'over {n} products', ar: 'أكثر من {n} منتج', es: 'más de {n} productos' },
    'results.empty': { fr: 'Aucun produit ne correspond', en: 'No matching product', ar: 'لا يوجد منتج مطابق', es: 'Ningún producto coincide' },
    'results.emptyHint': { fr: 'Essayez d\'autres mots-clés ou retirez des filtres.', en: 'Try other keywords or remove some filters.', ar: 'جرّب كلمات أخرى أو أزل بعض عوامل التصفية.', es: 'Prueba otras palabras o quita filtros.' },

    'product.ingredients': { fr: 'Ingrédients', en: 'Ingredients', ar: 'المكونات', es: 'Ingredientes' },
    'product.nutrition': { fr: 'Nutrition', en: 'Nutrition', ar: 'التغذية', es: 'Nutrición' },
    'product.details': { fr: 'Détails', en: 'Details', ar: 'التفاصيل', es: 'Detalles' },
    'product.halalStatus': { fr: 'Statut halal', en: 'Halal status', ar: 'حالة الحلال', es: 'Estado halal' },
    'product.notFound': { fr: 'Produit introuvable', en: 'Product not found', ar: 'المنتج غير موجود', es: 'Producto no encontrado' },
    'product.share': { fr: 'Partager', en: 'Share', ar: 'مشاركة', es: 'Compartir' },
    'product.compare': { fr: 'Comparer', en: 'Compare', ar: 'قارن', es: 'Comparar' },
    'product.linkCopied': { fr: 'Lien copié', en: 'Link copied', ar: 'تم نسخ الرابط', es: 'Enlace copiado' },
    'list.added': { fr: 'Ajouté à « {list} »', en: 'Added to “{list}”', ar: 'أضيف إلى «{list}»', es: 'Añadido a «{list}»' },
    'list.removed': { fr: 'Retiré de « {list} »', en: 'Removed from “{list}”', ar: 'أزيل من «{list}»', es: 'Quitado de «{list}»' },

    'error.network': { fr: 'Pas de connexion. Vérifiez votre réseau puis réessayez.', en: 'No connection. Check your network and try again.', ar: 'لا يوجد اتصال. تحقق من الشبكة ثم أعد المحاولة.', es: 'Sin conexión. Revisa tu red e inténtalo de nuevo.' },
    'error.timeout': { fr: 'Le serveur met trop de temps à répondre. Réessayez dans un instant.', en: 'The server is taking too long. Try again in a moment.', ar: 'الخادم يستغرق وقتًا طويلاً. أعد المحاولة بعد قليل.', es: 'El servidor tarda demasiado. Inténtalo en un momento.' },
    'error.notFound': { fr: 'Élément introuvable.', en: 'Not found.', ar: 'غير موجود.', es: 'No encontrado.' },
    'error.rateLimit': { fr: 'Trop de requêtes. Patientez quelques secondes.', en: 'Too many requests. Please wait a few seconds.', ar: 'طلبات كثيرة جدًا. انتظر بضع ثوانٍ.', es: 'Demasiadas solicitudes. Espera unos segundos.' },
    'error.computing': { fr: 'Les statistiques sont en cours de calcul. Elles seront disponibles dans quelques minutes.', en: 'Statistics are being computed. They will be available in a few minutes.', ar: 'يجري حساب الإحصائيات. ستتوفر خلال دقائق.', es: 'Las estadísticas se están calculando. Estarán disponibles en unos minutos.' },
    'error.badRequest': { fr: 'La demande est invalide.', en: 'Invalid request.', ar: 'طلب غير صالح.', es: 'Solicitud no válida.' },
    'error.server': { fr: 'Le service est momentanément indisponible. Réessayez plus tard.', en: 'The service is temporarily unavailable. Try again later.', ar: 'الخدمة غير متاحة مؤقتًا. أعد المحاولة لاحقًا.', es: 'El servicio no está disponible. Inténtalo más tarde.' },
    'error.title': { fr: 'Impossible de charger les données', en: 'Could not load data', ar: 'تعذر تحميل البيانات', es: 'No se pudieron cargar los datos' },

    'footer.discover': { fr: 'Découvrir', en: 'Discover', ar: 'اكتشف', es: 'Descubrir' },
    'footer.contribute': { fr: 'Contribuer', en: 'Contribute', ar: 'ساهم', es: 'Contribuir' },
    'footer.about': { fr: 'À propos', en: 'About', ar: 'حول', es: 'Acerca de' },
    'footer.addProduct': { fr: 'Ajouter un produit', en: 'Add a product', ar: 'أضف منتجًا', es: 'Añadir un producto' },
    'footer.legal': { fr: 'Mentions légales', en: 'Legal notice', ar: 'إشعار قانوني', es: 'Aviso legal' },
    'footer.terms': { fr: 'Conditions d\'utilisation', en: 'Terms of use', ar: 'شروط الاستخدام', es: 'Condiciones de uso' },
    'footer.account': { fr: 'Compte contributeur', en: 'Contributor account', ar: 'حساب المساهم', es: 'Cuenta de colaborador' },
    'footer.source': { fr: 'Code source', en: 'Source code', ar: 'الشيفرة المصدرية', es: 'Código fuente' },
    'footer.license': { fr: 'Données sous licence ODbL', en: 'Data under ODbL licence', ar: 'البيانات بترخيص ODbL', es: 'Datos con licencia ODbL' },
    'footer.disclaimer': { fr: "Statuts calculés d'après les labels et les ingrédients déclarés par les contributeurs : vérifiez toujours l'emballage.", en: 'Statuses are based on the labels and ingredients entered by contributors: always check the packaging.', ar: 'تُحتسب الحالات من الملصقات والمكونات التي يُدخلها المساهمون: تحقّق دائمًا من العبوة.', es: 'Estados calculados a partir de las etiquetas e ingredientes declarados por los colaboradores: comprueba siempre el envase.' },

    'home.eyebrow.food': { fr: 'La première base de données mondiale des produits halal', en: "The world's first database of halal products", ar: 'أول قاعدة بيانات عالمية للمنتجات الحلال', es: 'La primera base de datos mundial de productos halal' },
    'home.eyebrow.beauty': { fr: 'La première base de données mondiale des cosmétiques halal', en: "The world's first database of halal cosmetics", ar: 'أول قاعدة بيانات عالمية لمستحضرات التجميل الحلال', es: 'La primera base de datos mundial de cosméticos halal' },
    'home.popular': { fr: 'Les plus consultés', en: 'Most viewed', ar: 'الأكثر مشاهدة', es: 'Los más consultados' },
    'home.recent': { fr: 'Dernières contributions', en: 'Latest contributions', ar: 'أحدث المساهمات', es: 'Últimas contribuciones' },
    'home.partners': { fr: 'Ils nous soutiennent', en: 'They support us', ar: 'يدعموننا', es: 'Nos apoyan' },
    'home.legend': { fr: 'Comment lire un statut', en: 'How to read a status', ar: 'كيف تقرأ الحالة', es: 'Cómo leer un estado' },
    'stats.products': { fr: 'produits référencés', en: 'products listed', ar: 'منتج مسجل', es: 'productos registrados' },
    'stats.halal': { fr: 'produits halal', en: 'halal products', ar: 'منتجات حلال', es: 'productos halal' },
    'stats.excluded': { fr: 'non conformes', en: 'non-compliant', ar: 'غير مطابقة', es: 'no conformes' },
    'ocr.loading': { fr: 'Préparation de la lecture (la première fois seulement)…', en: 'Preparing the reader (first time only)…', ar: 'جارٍ تجهيز القراءة (في المرة الأولى فقط)…', es: 'Preparando la lectura (solo la primera vez)…' },
    'ocr.reading': { fr: 'Lecture du texte…', en: 'Reading the text…', ar: 'جارٍ قراءة النص…', es: 'Leyendo el texto…' },
    'stats.doubtful': { fr: 'douteux', en: 'doubtful', ar: 'مشكوك فيها', es: 'dudosos' },
    'stats.unknown': { fr: 'non renseignés', en: 'no information', ar: 'غير محددة', es: 'sin información' },
    'stats.contributors': { fr: 'contributeurs', en: 'contributors', ar: 'مساهم', es: 'colaboradores' },
    'stats.countries': { fr: 'pays', en: 'countries', ar: 'بلد', es: 'países' },
};

export function translate(key, lang = 'fr', vars = {}) {
    const entry = DICT[key];
    const text = entry ? (entry[lang] ?? entry.fr) : key;
    return text.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? vars[name] : `{${name}}`));
}

export function hasKey(key) {
    return key in DICT;
}

export function missingTranslations() {
    return Object.entries(DICT).flatMap(([key, entry]) => LANGS.filter((lang) => !entry[lang]).map((lang) => `${key}:${lang}`));
}

export function isRtl(lang) {
    return RTL.has(lang);
}

export function normalizeLang(value) {
    const lang = String(value || '').slice(0, 2).toLowerCase();
    return LANGS.includes(lang) ? lang : 'fr';
}
