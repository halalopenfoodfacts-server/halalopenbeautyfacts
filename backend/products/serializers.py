from rest_framework import serializers
from .models import Product


def build_image_url(code: str, portal: str = 'food') -> str:
    """Construit l'URL d'image à partir du code-barres selon le portal"""
    code = str(code).strip()
    if len(code) >= 9:
        path = f"{code[0:3]}/{code[3:6]}/{code[6:9]}/{code[9:]}"
    elif len(code) >= 6:
        path = f"{code[0:3]}/{code[3:6]}/{code[6:]}"
    else:
        path = code
    domain = 'images.openbeautyfacts.org' if portal == 'beauty' else 'images.openfoodfacts.org'
    return f"https://{domain}/images/products/{path}/front_en.full.jpg"


def parse_tags(val):
    """Always return a list, never a string — handles CSV strings, lists, None."""
    if not val:
        return []
    if isinstance(val, list):
        return [v.strip() for v in val if v and str(v).strip()]
    if isinstance(val, str):
        return [v.strip() for v in val.split(',') if v.strip()]
    return []


class ProductListSerializer(serializers.ModelSerializer):
    """Serializer léger pour les listes (search, top scans)"""
    image_front_small_url = serializers.SerializerMethodField()
    image_front_url = serializers.SerializerMethodField()
    labels_tags = serializers.SerializerMethodField()
    categories_tags = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'code', 'product_name', 'brands',
            'image_front_small_url', 'image_front_url',
            'labels_tags', 'categories_tags',
            'unique_scans_n', 'is_halal', 'is_excluded',
        ]

    def get_image_front_small_url(self, obj):
        return obj.image_front_small_url or obj.image_front_url or build_image_url(obj.code, obj.portal)

    def get_image_front_url(self, obj):
        return obj.image_front_url or obj.image_front_small_url or build_image_url(obj.code, obj.portal)

    def get_labels_tags(self, obj):
        return parse_tags(obj.labels_tags)

    def get_categories_tags(self, obj):
        return parse_tags(obj.categories_tags)


class ProductDetailSerializer(serializers.ModelSerializer):
    """Serializer complet pour la page produit"""
    image_front_small_url = serializers.SerializerMethodField()
    image_front_url = serializers.SerializerMethodField()
    labels_tags = serializers.SerializerMethodField()
    categories_tags = serializers.SerializerMethodField()
    countries_tags = serializers.SerializerMethodField()
    nutriments = serializers.SerializerMethodField()
    nutriscore_grade = serializers.SerializerMethodField()
    nova_group = serializers.SerializerMethodField()
    ecoscore_grade = serializers.SerializerMethodField()

    def get_labels_tags(self, obj):
        return parse_tags(obj.labels_tags)

    def get_categories_tags(self, obj):
        return parse_tags(obj.categories_tags)

    def get_countries_tags(self, obj):
        return parse_tags(obj.countries_tags)

    class Meta:
        model = Product
        fields = [
            'code', 'product_name', 'generic_name', 'brands',
            'categories_tags', 'labels_tags', 'countries_tags',
            'ingredients_text',
            'image_front_url', 'image_front_small_url',
            'image_ingredients_url', 'image_nutrition_url',
            'unique_scans_n', 'last_modified_t', 'creator',
            'is_halal', 'is_excluded',
            'nutriments', 'nutriscore_grade', 'nova_group', 'ecoscore_grade',
        ]

    def _get_jsonb(self, obj):
        return obj.data or {}

    def get_image_front_small_url(self, obj):
        return obj.image_front_small_url or obj.image_front_url or build_image_url(obj.code, obj.portal)

    def get_image_front_url(self, obj):
        return obj.image_front_url or obj.image_front_small_url or build_image_url(obj.code, obj.portal)

    def get_nutriments(self, obj):
        d = self._get_jsonb(obj)
        result = {}
        for key in ['energy_100g', 'fat_100g', 'saturated-fat_100g',
                    'carbohydrates_100g', 'sugars_100g', 'proteins_100g', 'salt_100g']:
            val = d.get(key)
            if val not in (None, ''):
                try:
                    result[key] = float(val)
                except (ValueError, TypeError):
                    result[key] = val
        return result

    def get_nutriscore_grade(self, obj):
        return self._get_jsonb(obj).get('nutriscore_grade', '')

    def get_nova_group(self, obj):
        val = self._get_jsonb(obj).get('nova_group', '')
        try:
            return int(val) if val else None
        except (ValueError, TypeError):
            return None

    def get_ecoscore_grade(self, obj):
        return self._get_jsonb(obj).get('ecoscore_grade', '')

    def to_representation(self, instance):
        """Ajoute les champs supplémentaires depuis data JSONB"""
        ret = super().to_representation(instance)
        d = self._get_jsonb(instance)
        ret['quantity'] = d.get('quantity', '') or ''
        ret['packaging'] = d.get('packaging', '') or ''
        ret['stores'] = d.get('stores', '') or ''
        ret['additives_tags'] = self._parse_tags(d.get('additives_tags', ''))
        ret['allergens_tags'] = self._parse_tags(d.get('allergens_tags', ''))
        ret['origins_tags'] = self._parse_tags(d.get('origins_tags') or d.get('origins', ''))
        ret['origins'] = d.get('origins', '') or ''
        ret['manufacturing_places'] = d.get('manufacturing_places', '') or ''
        ret['conservation_conditions_fr'] = d.get('conservation_conditions_fr', '') or d.get('conservation_conditions', '') or ''
        ret['traces_tags'] = self._parse_tags(d.get('traces_tags', ''))
        ret['traces'] = d.get('traces', '') or ''
        ret['packaging_tags'] = self._parse_tags(d.get('packaging_tags', ''))
        ret['ingredients_analysis_tags'] = self._parse_tags(d.get('ingredients_analysis_tags', ''))
        ret['ingredients_from_palm_oil_tags'] = self._parse_tags(d.get('ingredients_from_palm_oil_tags', ''))
        ret['ingredients_that_may_be_from_palm_oil_tags'] = self._parse_tags(d.get('ingredients_that_may_be_from_palm_oil_tags', ''))
        ret['states_tags'] = self._parse_tags(d.get('states_tags', ''))
        ret['editors_tags'] = self._parse_tags(d.get('editors_tags', ''))
        ret['ingredients_text_fr'] = d.get('ingredients_text_fr', '') or d.get('ingredients_text', '') or ''
        return ret

    def _parse_tags(self, val):
        return parse_tags(val)