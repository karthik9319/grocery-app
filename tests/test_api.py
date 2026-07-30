"""API-level tests via FastAPI's TestClient. These exercise the HTTP layer end to end
against a throwaway database (see conftest.py), covering the health probe, item CRUD, the
atomic bulk endpoints, cross-list search, quick-add parsing, and price/spend capture."""


def _add_item(client, title, category="Groceries", quantity=1, price=None):
    data = {"title": title, "category": category, "quantity": quantity}
    if price is not None:
        data["price"] = price
    return client.post("/api/items", data=data)


def test_health_ok(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"


def test_meta_lists_categories(client):
    resp = client.get("/api/meta")
    assert resp.status_code == 200
    assert "Groceries" in resp.json()["categories"]


def test_item_create_and_list(client):
    assert _add_item(client, "Milk").json()["status"] == "added"
    items = client.get("/api/items").json()
    assert any(i["title"] == "Milk" for i in items)


def test_patch_quantity(client):
    _add_item(client, "Eggs", quantity=2)
    item = client.get("/api/items").json()[0]
    resp = client.patch(f"/api/items/{item['id']}/quantity", data={"quantity": 7})
    assert resp.status_code == 200
    updated = client.get("/api/items").json()[0]
    assert updated["quantity"] == 7


def test_use_and_return_endpoints(client):
    _add_item(client, "Shampoo", category="Household", quantity=2)
    item = client.get("/api/items").json()[0]

    assert client.patch(f"/api/items/{item['id']}/use", data={"amount": 1}).status_code == 200
    refreshed = client.get("/api/items").json()[0]
    assert refreshed["in_use_quantity"] == 1

    # over-using should 400
    assert client.patch(f"/api/items/{item['id']}/use", data={"amount": 99}).status_code == 400

    assert client.patch(f"/api/items/{item['id']}/return", data={"amount": 1}).status_code == 200
    refreshed = client.get("/api/items").json()[0]
    assert refreshed["in_use_quantity"] == 0


def test_bulk_delete_atomic(client):
    _add_item(client, "A")
    _add_item(client, "B")
    _add_item(client, "C", category="Snacks")
    ids = [i["id"] for i in client.get("/api/items", params={"category": "Groceries"}).json()]

    resp = client.post("/api/items/bulk-delete", json=ids)
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 2
    assert client.get("/api/items", params={"category": "Groceries"}).json() == []
    assert len(client.get("/api/items", params={"category": "Snacks"}).json()) == 1


def test_bulk_move(client):
    _add_item(client, "A")
    _add_item(client, "B")
    ids = [i["id"] for i in client.get("/api/items", params={"category": "Groceries"}).json()]

    resp = client.post("/api/items/bulk-move", json={"ids": ids, "category": "Snacks"})
    assert resp.status_code == 200
    assert resp.json()["moved"] == 2
    assert client.get("/api/items", params={"category": "Groceries"}).json() == []


def test_bulk_move_rejects_unknown_category(client):
    _add_item(client, "A")
    ids = [i["id"] for i in client.get("/api/items").json()]
    resp = client.post("/api/items/bulk-move", json={"ids": ids, "category": "Nonexistent"})
    assert resp.status_code == 400


def test_search_across_lists(client):
    _add_item(client, "Atta")
    client.post("/api/shopping-list", data={"title": "Atta bread", "category": "Groceries"})
    results = client.get("/api/search", params={"q": "atta"}).json()
    assert any(i["title"] == "Atta" for i in results["items"])
    assert len(results["shopping_list"]) == 1


def test_quick_add_parse_endpoint(client):
    resp = client.get("/api/quick-add/parse", params={"text": "2 milk, toothpaste"})
    assert resp.status_code == 200
    titles = {i["title"] for i in resp.json()["items"]}
    assert "Milk" in titles
    assert "Toothpaste" in titles


def test_price_capture_records_purchase(client):
    _add_item(client, "Cheese", price=4.50)
    summary = client.get("/api/purchases/summary").json()
    assert summary["total_spend"] == 4.50
    assert any(row["title"] == "Cheese" for row in summary["spend_by_item"])


def test_usage_events_logged_and_history(client):
    _add_item(client, "Milk", quantity=5)
    item = client.get("/api/items").json()[0]
    # adding logs an 'add' event
    hist = client.get(f"/api/items/{item['id']}/history").json()
    assert any(e["event_type"] == "add" for e in hist)
    # decreasing quantity logs a 'consume' event
    client.patch(f"/api/items/{item['id']}/quantity", data={"quantity": 3})
    hist = client.get(f"/api/items/{item['id']}/history").json()
    assert any(e["event_type"] == "consume" for e in hist)


def test_predictions_from_history(client):
    import datetime as dt

    import inventory

    _add_item(client, "Milk", quantity=10)
    item = client.get("/api/items").json()[0]
    with inventory.get_connection() as conn:
        for days_ago, after in ((4, 8), (0, 6)):
            conn.execute(
                "INSERT INTO usage_events (item_id, title, category, event_type, amount, "
                "quantity_after, created_at) VALUES (?, ?, ?, 'consume', -2, ?, ?)",
                (item["id"], "Milk", "Groceries", after,
                 (dt.datetime.now() - dt.timedelta(days=days_ago)).isoformat()),
            )
        conn.commit()
    preds = client.get("/api/insights/predictions").json()
    milk = next((p for p in preds if p["item"]["title"] == "Milk"), None)
    assert milk is not None
    assert milk["rate_per_day"] == 1.0  # 4 consumed over 4 days
    assert milk["days_left"] == 10.0  # 10 on hand / 1 per day

