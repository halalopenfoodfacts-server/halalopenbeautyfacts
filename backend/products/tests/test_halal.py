from django.test import SimpleTestCase

from products import halal


class ClassifyTests(SimpleTestCase):
    def status(self, labels=None, is_halal=None, is_excluded=None, ingredients='', portal='food'):
        return halal.classify(labels, is_halal, is_excluded, ingredients, portal)['status']

    def test_no_ingredients_is_unknown(self):
        self.assertEqual(self.status(), halal.UNKNOWN)
        self.assertEqual(self.status([], None, None, '   '), halal.UNKNOWN)

    def test_ingredients_without_alcohol_or_pork_are_halal(self):
        # Règle de l'association : ni alcool ni porc dans les ingrédients → halal (viandes comprises)
        self.assertEqual(self.status([], None, None, 'Blé, sucre, sel'), halal.HALAL)
        self.assertEqual(self.status([], None, None, 'Filet de poulet, sel'), halal.HALAL)
        self.assertEqual(self.status([], None, None, 'Jambon de dinde, eau, sel'), halal.HALAL)
        self.assertEqual(self.status([], None, None, 'Vinaigre de vin, sans alcool'), halal.HALAL)

    def test_alcohol_or_pork_in_ingredients_is_haram(self):
        self.assertEqual(self.status([], None, None, 'Sucre, gélatine de porc'), halal.HARAM)
        self.assertEqual(self.status([], None, None, 'Farine, saindoux'), halal.HARAM)
        self.assertEqual(self.status([], None, None, 'Chocolat, rhum 2 %'), halal.HARAM)
        self.assertEqual(self.status([], None, None, 'Alcohol Denat., Parfum', 'beauty'), halal.HARAM)

    def test_exclusion_label_is_haram(self):
        # Régression H2 : bière (label contains-alcohol, is_excluded) affichée « à vérifier »
        self.assertEqual(self.status(['en:contains-alcohol'], None, True, 'Agua, malta de cebada'), halal.HARAM)
        self.assertEqual(self.status([], None, True, ''), halal.HARAM)

    def test_halal_label_is_halal_even_with_vinegar(self):
        # Régression H3 : « vin » trouvé dans « vinegar »
        self.assertEqual(
            self.status(['en:halal', 'en:halal-food-authority'], True, None, 'Water, spirit vinegar, sugar'),
            halal.HALAL,
        )

    def test_specific_halal_mention_counts_as_label(self):
        self.assertEqual(self.status(['fr:avs-halal'], None, None, ''), halal.HALAL)
        self.assertEqual(self.status(['en:non-halal'], None, None, ''), halal.HARAM)

    def test_conflicting_labels_are_doubtful(self):
        result = halal.classify(['en:halal', 'en:contains-alcohol'])
        self.assertEqual(result['status'], halal.DOUBTFUL)
        self.assertEqual(result['reasons'][0]['type'], 'conflict')

    def test_sensitive_ingredient_without_label_is_doubtful(self):
        self.assertEqual(self.status([], None, None, 'Sucre, gélatine'), halal.DOUBTFUL)
        self.assertEqual(self.status([], None, None, 'Sirop, E120'), halal.DOUBTFUL)
        self.assertEqual(self.status([], None, None, "mono- et diglycérides d'acides gras"), halal.DOUBTFUL)

    def test_never_verified(self):
        self.assertFalse(halal.classify(['en:halal'])['verified_certification'])


class IngredientSignalTests(SimpleTestCase):
    def test_whole_words_only(self):
        self.assertEqual(halal.ingredient_signals('vinaigre, sel'), [])
        self.assertEqual(halal.ingredient_signals('Spirits of mint flavour'), [])
        self.assertEqual(halal.ingredient_signals('pigment naturel, graham'), [])

    def test_wine_vinegar_and_negations_are_ignored(self):
        self.assertEqual(halal.ingredient_signals('vinaigre de vin, sans porc, sans alcool'), [])
        self.assertEqual(halal.ingredient_signals('alcohol-free formula', 'beauty'), [])

    def test_detects_with_accents_and_case(self):
        self.assertEqual(halal.ingredient_signals('GÉLATINE BOVINE'), ['gélatine'])
        self.assertIn('vin / spiritueux', halal.ingredient_signals('Vin rouge 12 %'))

    def test_beauty_fatty_alcohols_are_not_ethanol(self):
        self.assertEqual(halal.ingredient_signals('Aqua, Cetearyl Alcohol, Glycerin', 'beauty'), [])
        self.assertEqual(halal.ingredient_signals('Alcohol Denat., Parfum', 'beauty'), ['alcool'])
        self.assertIn('suif', halal.ingredient_signals('Sodium Tallowate, Aqua', 'beauty'))

    def test_food_only_signals_do_not_apply_to_beauty(self):
        # La glycérine est quasi universelle en cosmétique : non signalée côté beauty
        self.assertEqual(halal.ingredient_signals('Glycerin', 'beauty'), [])
        self.assertEqual(halal.ingredient_signals('glycérine', 'food'), ['glycérine (E422)'])
