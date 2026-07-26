"""Unit tests for the SQLite data layer (inventory.py), including the data-integrity
additions: atomic bulk operations, in-use quantity transitions, and purchase history."""
import inventory


def test_add_and_fetch_item():
    inventory.add_item("Milk", "Groceries", 3, None)
    items = inventory.get_items_by_category("Groceries")
    assert len(items) == 1
    assert items[0]["title"] == "Milk"
    assert items[0]["quantity"] == 3
    assert items[0]["in_use_quantity"] == 0


def test_find_item_by_title_is_case_insensitive():
    inventory.add_item("Atta", "Groceries", 1, None)
    assert inventory.find_item_by_title("atta", "Groceries") is not None
    assert inventory.find_item_by_title("ATTA", "Groceries") is not None
    assert inventory.find_item_by_title("atta", "Snacks") is None


def test_update_quantity_deletes_at_zero_when_not_in_use():
    inventory.add_item("Eggs", "Groceries", 2, None)
    item = inventory.get_items_by_category("Groceries")[0]
    inventory.update_quantity(item["id"], 0)
    assert inventory.get_items_by_category("Groceries") == []


def test_in_use_transitions_and_zero_keeps_row():
    inventory.add_item("Shampoo", "Household", 2, None)
    item = inventory.get_items_by_category("Household")[0]

    inventory.move_to_in_use(item["id"], 1)
    refreshed = inventory.get_items_by_category("Household")[0]
    assert refreshed["quantity"] == 1
    assert refreshed["in_use_quantity"] == 1

    # dropping quantity to 0 while some is in use must NOT delete the row
    inventory.update_quantity(item["id"], 0)
    refreshed = inventory.get_items_by_category("Household")[0]
    assert refreshed["quantity"] == 0
    assert refreshed["in_use_quantity"] == 1

    inventory.move_from_in_use(item["id"], 1)
    refreshed = inventory.get_items_by_category("Household")[0]
    assert refreshed["in_use_quantity"] == 0


def test_move_to_in_use_rejects_too_much():
    inventory.add_item("Soap", "Household", 1, None)
    item = inventory.get_items_by_category("Household")[0]
    import pytest

    with pytest.raises(ValueError):
        inventory.move_to_in_use(item["id"], 5)


def test_bulk_delete_is_atomic_and_returns_rows():
    inventory.add_item("A", "Groceries", 1, None)
    inventory.add_item("B", "Groceries", 1, None)
    inventory.add_item("C", "Snacks", 1, None)
    ids = [i["id"] for i in inventory.get_items_by_category("Groceries")]

    deleted = inventory.bulk_delete_items(ids)
    assert len(deleted) == 2
    assert inventory.get_items_by_category("Groceries") == []
    # unrelated item untouched
    assert len(inventory.get_items_by_category("Snacks")) == 1


def test_bulk_move_items():
    inventory.add_item("A", "Groceries", 1, None)
    inventory.add_item("B", "Groceries", 1, None)
    ids = [i["id"] for i in inventory.get_items_by_category("Groceries")]

    moved = inventory.bulk_move_items(ids, "Snacks")
    assert moved == 2
    assert inventory.get_items_by_category("Groceries") == []
    assert len(inventory.get_items_by_category("Snacks")) == 2


def test_bulk_delete_cascades_aliases_and_photos():
    inventory.add_item("Cola", "Groceries", 1, None)
    item = inventory.get_items_by_category("Groceries")[0]
    inventory.add_alias(item["id"], "soda")
    inventory.add_item_photo(item["id"], "data/images/fake.jpg")

    inventory.bulk_delete_items([item["id"]])
    assert inventory.find_item_by_alias("soda") is None
    assert inventory.get_item_photos(item["id"]) == []


def test_purchase_history_and_spend():
    inventory.add_purchase("Milk", "Groceries", 2, 4.50, source="test")
    inventory.add_purchase("Rice", "Groceries", 1, 5.50, source="test")
    assert inventory.get_total_spend() == 10.0

    by_item = inventory.get_spend_by_item()
    titles = {row["title"] for row in by_item}
    assert {"Milk", "Rice"} <= titles

    over_time = inventory.get_spend_over_time()
    assert len(over_time) == 1  # both in the same month
    assert over_time[0]["total"] == 10.0

    # last unit price = total / quantity
    assert inventory.get_last_price("Milk") == 2.25
