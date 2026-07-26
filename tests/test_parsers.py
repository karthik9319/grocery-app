"""Tests for the best-effort parsers: receipt line parsing (now capturing prices) and the
free-text / voice quick-add parser."""
import api
import receipt


def _by_title(candidates):
    return {c["title"]: c for c in candidates}


def test_receipt_parses_price():
    candidates = receipt.parse_receipt_text("Whole Milk 3.49")
    assert len(candidates) == 1
    assert candidates[0]["price"] == 3.49


def test_receipt_parses_leading_quantity():
    candidates = receipt.parse_receipt_text("2x Eggs 5.00")
    c = candidates[0]
    assert c["quantity"] == 2
    assert c["price"] == 5.00


def test_receipt_parses_weight():
    candidates = receipt.parse_receipt_text("1.5 lb Bananas 2.25")
    c = candidates[0]
    assert c["weight_grams"] == 680.4  # 1.5 * 453.592, rounded
    assert c["price"] == 2.25


def test_receipt_skips_noise_lines():
    text = "Milk 3.49\nSUBTOTAL 3.49\nTAX 0.30\nTOTAL 3.79\nVISA 3.79"
    candidates = receipt.parse_receipt_text(text)
    titles = [c["title"] for c in candidates]
    assert "Milk" in titles
    assert not any(t.lower() in {"subtotal", "tax", "total", "visa"} for t in titles)


def test_quick_add_parses_multiple_items():
    items = api.parse_quick_add("2 milk, 3 eggs and 500g rice, toothpaste")
    by_title = _by_title(items)
    assert by_title["Milk"]["quantity"] == 2
    assert by_title["Eggs"]["quantity"] == 3
    assert by_title["Toothpaste"]["category"] == "Household"
    assert "Rice" in by_title


def test_quick_add_strips_leading_verb():
    items = api.parse_quick_add("add shampoo")
    assert len(items) == 1
    assert items[0]["title"] == "Shampoo"
    assert items[0]["category"] == "Household"


def test_quick_add_empty_input():
    assert api.parse_quick_add("") == []


def test_detect_import_kind():
    assert api.detect_import_kind(["date", "meal_slot", "title", "notes"]) == "meal_plan"
    assert api.detect_import_kind(["title", "category", "default_quantity"]) == "favorites"
    assert api.detect_import_kind(["title", "category", "checked"]) == "shopping_list"
    assert api.detect_import_kind(["uuid", "title", "category", "quantity"]) == "inventory"
