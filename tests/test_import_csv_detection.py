import unittest

import api


class ImportCsvDetectionTests(unittest.TestCase):
    def test_detects_meal_plan_csv_by_headers(self):
        self.assertEqual(api.detect_import_kind(["date", "meal_slot", "title", "notes"]), "meal_plan")

    def test_detects_inventory_csv_by_headers(self):
        self.assertEqual(api.detect_import_kind(["uuid", "title", "category", "quantity"]), "inventory")

    def test_detects_favorites_csv_by_headers(self):
        self.assertEqual(api.detect_import_kind(["title", "category", "default_quantity"]), "favorites")

    def test_detects_shopping_list_csv_by_headers(self):
        self.assertEqual(api.detect_import_kind(["title", "category", "checked"]), "shopping_list")


if __name__ == "__main__":
    unittest.main()
