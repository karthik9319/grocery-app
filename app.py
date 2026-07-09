"""Grocery & Vegetable Inventory Tracker - simple Streamlit app (v1).

Run with:
    streamlit run app.py
"""
import uuid
from datetime import date, timedelta
from pathlib import Path

import html

import pandas as pd
import plotly.express as px
import streamlit as st
from PIL import Image, UnidentifiedImageError
from pillow_heif import register_heif_opener

import inventory
import receipt

register_heif_opener()

BASE_DIR = Path(__file__).parent
IMAGES_DIR = BASE_DIR / "data" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

inventory.init_db()

CATEGORY_ICONS = {"Groceries": "🧺", "Vegetables": "🥕", "Household": "🧴"}
CATEGORIES = list(CATEGORY_ICONS.keys())
PALETTE = {"Groceries": "#1B7A4D", "Vegetables": "#FF8C42", "Household": "#6C63FF"}
CATEGORY_UNITS = {"Groceries": "count", "Vegetables": "g", "Household": "count"}


def format_quantity(quantity: float, unit: str) -> str:
    """Format a raw stored quantity for display given its category's unit."""
    if unit == "g":
        if quantity >= 1000:
            return f"{quantity / 1000:g} kg"
        return f"{quantity:g} g"
    if float(quantity).is_integer():
        return str(int(quantity))
    return f"{quantity:g}"


def hex_to_rgba(hex_color: str, alpha: float) -> str:
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return f"rgba({r},{g},{b},{alpha})"


# name keyword -> (likely category, typical shelf-life in days). Used to nudge a
# category guess (receipt-scanned items) and suggest an expiration date - always
# editable/overridable by the user, never enforced.
COMMON_ITEMS = {
    "tomato": ("Vegetables", 5), "potato": ("Vegetables", 21), "onion": ("Vegetables", 30),
    "carrot": ("Vegetables", 21), "broccoli": ("Vegetables", 7), "cucumber": ("Vegetables", 7),
    "cabbage": ("Vegetables", 14), "spinach": ("Vegetables", 4), "lettuce": ("Vegetables", 7),
    "pepper": ("Vegetables", 7), "garlic": ("Vegetables", 60), "ginger": ("Vegetables", 21),
    "cauliflower": ("Vegetables", 7), "eggplant": ("Vegetables", 7), "zucchini": ("Vegetables", 7),
    "corn": ("Vegetables", 3), "peas": ("Vegetables", 5), "beans": ("Vegetables", 5),
    "mushroom": ("Vegetables", 5), "pumpkin": ("Vegetables", 30), "beet": ("Vegetables", 21),
    "radish": ("Vegetables", 14), "celery": ("Vegetables", 14), "kale": ("Vegetables", 5),
    "milk": ("Groceries", 7), "bread": ("Groceries", 5), "egg": ("Groceries", 21),
    "cheese": ("Groceries", 21), "butter": ("Groceries", 60), "yogurt": ("Groceries", 14),
    "rice": ("Groceries", 365), "pasta": ("Groceries", 365), "atta": ("Groceries", 180),
    "cereal": ("Groceries", 180), "coffee": ("Groceries", 180), "tea": ("Groceries", 365),
    "sugar": ("Groceries", 365), "flour": ("Groceries", 180), "chicken": ("Groceries", 2),
    "beef": ("Groceries", 3), "fish": ("Groceries", 2), "apple": ("Groceries", 21),
    "banana": ("Groceries", 5), "orange": ("Groceries", 14), "juice": ("Groceries", 7),
    "shampoo": ("Household", None), "soap": ("Household", None), "detergent": ("Household", None),
    "toothpaste": ("Household", None), "tissue": ("Household", None),
}


def guess_category(title: str) -> str:
    """Best-effort category guess from a free-text title, defaulting to Groceries."""
    lower = title.lower()
    for keyword, (category, _) in COMMON_ITEMS.items():
        if keyword in lower:
            return category
    return "Groceries"


def estimate_shelf_life_days(title: str, category: str) -> int:
    """Best-effort shelf-life estimate in days for suggesting an expiration date."""
    lower = title.lower()
    for keyword, (_, days) in COMMON_ITEMS.items():
        if keyword in lower and days is not None:
            return days
    return 30 if category == "Vegetables" else 14


try:
    IS_DARK_THEME = st.context.theme.type == "dark"
except Exception:
    IS_DARK_THEME = False

PLOTLY_TEMPLATE = "plotly_dark" if IS_DARK_THEME else "plotly_white"

CUSTOM_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

html, body, [class*="css"] {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.stApp { background: var(--background-color, #FAFDFB); }

.block-container {
    padding-top: 2rem;
    padding-bottom: 3rem;
    max-width: 1180px;
}

.hero-banner {
    display: flex;
    align-items: center;
    gap: 20px;
    background: linear-gradient(135deg, #1B7A4D 0%, #0F5132 100%);
    border-radius: 20px;
    padding: 28px 32px;
    margin-bottom: 1.8rem;
    box-shadow: 0 12px 30px rgba(15, 81, 50, 0.22);
}
.hero-emoji { font-size: 46px; line-height: 1; }
.hero-banner h1 {
    color: #ffffff; margin: 0; font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em;
}
.hero-banner p {
    color: rgba(255,255,255,0.88); margin: 6px 0 0 0; font-size: 0.95rem; font-weight: 400;
}

div[data-testid="stMetric"] {
    background: var(--secondary-background-color, #FFFFFF);
    border: 1px solid rgba(27, 122, 77, 0.25) !important;
    border-radius: 16px;
    padding: 14px 18px 12px 18px;
    box-shadow: 0 4px 16px rgba(15, 40, 25, 0.06);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
}
div[data-testid="stMetric"]:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 24px rgba(15, 40, 25, 0.12);
}
div[data-testid="stMetricValue"] { font-weight: 800 !important; color: var(--primary-color, #1B7A4D) !important; }
div[data-testid="stMetricLabel"] { font-weight: 600 !important; color: var(--text-color, #4B5B53) !important; }

div[data-testid="stVerticalBlockBorderWrapper"] {
    border-radius: 14px !important;
    box-shadow: 0 2px 10px rgba(15, 40, 25, 0.05);
    transition: box-shadow 0.15s ease, transform 0.15s ease;
    background: var(--secondary-background-color, #FFFFFF);
}
div[data-testid="stVerticalBlockBorderWrapper"]:hover {
    box-shadow: 0 10px 22px rgba(15, 40, 25, 0.10);
}

div[data-testid="stImage"] img {
    border-radius: 10px;
    object-fit: cover;
}

.stButton > button {
    border-radius: 10px;
    font-weight: 600;
    transition: all 0.15s ease;
    box-shadow: 0 2px 8px rgba(15, 40, 25, 0.08);
}
.stButton > button:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 18px rgba(15, 40, 25, 0.18);
}

button[data-baseweb="tab"] {
    border-radius: 10px 10px 0 0;
    font-weight: 700;
    padding: 10px 20px;
}
div[data-baseweb="tab-highlight"] {
    background-color: #1B7A4D;
    height: 3px;
    border-radius: 3px;
}

section[data-testid="stSidebar"] {
    background: var(--secondary-background-color, #F4FBF7);
    border-right: 1px solid rgba(27,122,77,0.15);
}

div[data-testid="stExpander"] {
    border-radius: 12px;
    border: 1px solid rgba(27,122,77,0.10) !important;
}

div[role="dialog"] { border-radius: 18px; }

input, textarea { border-radius: 8px !important; }
div[data-baseweb="select"] > div { border-radius: 8px !important; }

div[data-testid="stAlert"] {
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(15, 40, 25, 0.05);
}

div[data-testid="stForm"] {
    border-radius: 14px;
    border: 1px solid rgba(27,122,77,0.10) !important;
    padding: 1rem;
}

button[data-baseweb="tab"] p { font-size: 0.95rem; }

h3, h4 { font-weight: 700 !important; color: var(--primary-color, #1B7A4D); }
</style>
"""

st.set_page_config(page_title="Grocery & Vegetable Tracker", page_icon="🛒", layout="wide")
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)
st.markdown(
    """
    <div class="hero-banner">
        <div class="hero-emoji">🛒</div>
        <div>
            <h1>Grocery &amp; Vegetable Tracker</h1>
            <p>Snap a photo, name it, and keep track of what's left in the house.</p>
        </div>
    </div>
    """,
    unsafe_allow_html=True,
)

with st.sidebar:
    st.header("Settings")
    count_threshold = st.number_input(
        "Low stock threshold - count items (units left)",
        min_value=1,
        value=2,
        step=1,
    )
    weight_threshold = st.number_input(
        "Low stock threshold - vegetables (grams left)",
        min_value=1,
        value=200,
        step=50,
    )

# --- Home summary ---
def threshold_for(category: str) -> float:
    return weight_threshold if CATEGORY_UNITS[category] == "g" else count_threshold


def effective_threshold(item: dict) -> float:
    """An item's own custom_threshold overrides the category-wide default, if set."""
    custom = item.get("custom_threshold")
    return custom if custom is not None else threshold_for(item["category"])


def days_until_expiration(item: dict):
    """Days until expiration (negative if already expired), or None if not tracked."""
    exp = item.get("expiration_date")
    if not exp:
        return None
    return (date.fromisoformat(exp) - date.today()).days


EXPIRY_WARNING_DAYS = 3

category_totals = {cat: inventory.get_category_total(cat) for cat in CATEGORIES}
all_items = [item for cat in CATEGORIES for item in inventory.get_items_by_category(cat)]
total_rows = len(all_items)
low_stock_items = [item for item in all_items if item["quantity"] <= effective_threshold(item)]
expiring_items = []
for _item in all_items:
    _days_left = days_until_expiration(_item)
    if _days_left is not None and _days_left <= EXPIRY_WARNING_DAYS:
        expiring_items.append((_item, _days_left))
expiring_items.sort(key=lambda pair: pair[1])

with st.sidebar:
    st.divider()
    st.subheader("📤 Backup")
    if all_items:
        export_rows = [
            {
                "title": item["title"],
                "category": item["category"],
                "quantity": item["quantity"],
                "unit": CATEGORY_UNITS[item["category"]],
                "notes": item.get("notes") or "",
                "expiration_date": item.get("expiration_date") or "",
                "created_at": item["created_at"],
            }
            for item in all_items
        ]
        st.download_button(
            "Download inventory as CSV",
            data=pd.DataFrame(export_rows).to_csv(index=False),
            file_name=f"inventory_backup_{date.today().isoformat()}.csv",
            mime="text/csv",
            width="stretch",
        )
    else:
        st.caption("No items yet to export.")

if total_rows == 0:
    st.info(
        "👋 **Welcome!** Your inventory is empty. Head to the **➕ Add Items** tab below to "
        "snap a photo, take a picture, or scan a receipt to get started."
    )

top_col1, top_col2 = st.columns(2)
top_col1.metric("Total Items", total_rows, border=True)
top_col2.metric("⚠️ Low Stock", len(low_stock_items), border=True)

category_cols = st.columns(len(CATEGORIES))
for col, cat in zip(category_cols, CATEGORIES):
    col.metric(
        f"{CATEGORY_ICONS[cat]} {cat}",
        format_quantity(category_totals[cat], CATEGORY_UNITS[cat]),
        border=True,
    )

favorites = inventory.get_favorites()
if favorites:
    st.markdown("#### ⭐ Quick Add Favorites")
    fav_cols = st.columns(min(4, len(favorites)))
    for i, fav in enumerate(favorites):
        with fav_cols[i % len(fav_cols)]:
            label = f"+ {CATEGORY_ICONS.get(fav['category'], '')} {fav['title']}"
            if st.button(label, key=f"quickadd_{fav['id']}", width="stretch", type="primary"):
                existing = inventory.find_item_by_title(fav["title"], fav["category"])
                if existing:
                    inventory.update_quantity(
                        existing["id"], existing["quantity"] + fav["default_quantity"]
                    )
                else:
                    inventory.add_item(
                        fav["title"], fav["category"], fav["default_quantity"], None
                    )
                st.toast(f"Added {fav['title']}", icon="⭐")
                st.rerun()
    with st.expander("Manage favorites"):
        for fav in favorites:
            fcol1, fcol2 = st.columns([4, 1])
            fcol1.write(
                f"{CATEGORY_ICONS.get(fav['category'], '')} {fav['title']} — quick-add "
                f"{format_quantity(fav['default_quantity'], CATEGORY_UNITS[fav['category']])}"
            )
            if fcol2.button("Remove", key=f"unfav_{fav['id']}"):
                inventory.remove_favorite(fav["title"], fav["category"])
                st.rerun()

with st.expander("Breakdown by item"):
    breakdown = inventory.get_title_breakdown()
    if breakdown:
        display_breakdown = [
            {
                "title": b["title"],
                "category": b["category"],
                "quantity": format_quantity(b["total_quantity"], CATEGORY_UNITS[b["category"]]),
            }
            for b in breakdown
        ]
        st.dataframe(display_breakdown, width="stretch", hide_index=True)
    else:
        st.caption("No items yet - add one below.")

if low_stock_items:
    with st.expander("⚠️ Low stock items", expanded=True):
        st.dataframe(
            [
                {
                    "title": i["title"],
                    "category": i["category"],
                    "quantity": format_quantity(i["quantity"], CATEGORY_UNITS[i["category"]]),
                }
                for i in low_stock_items
            ],
            width="stretch",
            hide_index=True,
        )

if expiring_items:
    with st.expander("⏰ Expiring soon / expired", expanded=True):
        st.dataframe(
            [
                {
                    "title": item["title"],
                    "category": item["category"],
                    "quantity": format_quantity(item["quantity"], CATEGORY_UNITS[item["category"]]),
                    "status": (
                        "Expired" if days < 0 else ("Today" if days == 0 else f"{days}d left")
                    ),
                }
                for item, days in expiring_items
            ],
            width="stretch",
            hide_index=True,
        )

def render_add_by_photo() -> None:
    if "uploader_key" not in st.session_state:
        st.session_state.uploader_key = 0

    with st.container(border=True):
        input_method = st.radio(
            "Add photo via:", ["Upload", "Camera"], horizontal=True, key="input_method"
        )

        if input_method == "Upload":
            st.caption(
                "Tip: open this app's Network URL (shown in the terminal) on your iPhone over "
                "the same Wi-Fi to upload from your phone - the uploader there offers a native "
                "'Take Photo' option, and HEIC photos from the Photos app are supported. Select "
                "multiple photos at once to add several items in one go."
            )
            uploaded_files = st.file_uploader(
                "Upload one or more photos of groceries/vegetables/household items",
                type=["png", "jpg", "jpeg", "heic", "heif"],
                accept_multiple_files=True,
                key=f"uploader_{st.session_state.uploader_key}",
            )
            photo_sources = uploaded_files or []
        else:
            st.caption(
                "Live camera preview works from this Mac's browser. On an iPhone it usually "
                "needs HTTPS to access the camera, so prefer 'Upload' -> Take Photo on mobile "
                "instead."
            )
            camera_photo = st.camera_input(
                "Take a photo", key=f"camera_{st.session_state.uploader_key}"
            )
            photo_sources = [camera_photo] if camera_photo is not None else []

        entries = []
        for idx, photo_source in enumerate(photo_sources):
            try:
                image = Image.open(photo_source).convert("RGB")
            except UnidentifiedImageError:
                st.error(f"Photo {idx + 1}: could not read as an image (skipped).")
                continue

            with st.container(border=True):
                col_img, col_form = st.columns([1, 2])
                with col_img:
                    st.image(image, caption=f"Photo {idx + 1}", width="stretch")

                with col_form:
                    title = st.text_input(
                        "Title",
                        placeholder="e.g. Apples, Milk, Shampoo",
                        key=f"batch_title_{idx}",
                    )
                    category = st.selectbox(
                        "Category",
                        CATEGORIES,
                        format_func=lambda c: f"{CATEGORY_ICONS[c]} {c}",
                        key=f"batch_category_{idx}",
                    )

                    if CATEGORY_UNITS[category] == "g":
                        qty_col, unit_col = st.columns([2, 1])
                        with qty_col:
                            weight_value = st.number_input(
                                "Quantity",
                                min_value=0.1,
                                value=500.0,
                                step=50.0,
                                key=f"batch_qty_{idx}",
                            )
                        with unit_col:
                            weight_unit_choice = st.selectbox(
                                "Unit", ["g", "kg"], key=f"batch_unit_{idx}"
                            )
                        quantity = (
                            weight_value * 1000 if weight_unit_choice == "kg" else weight_value
                        )
                    else:
                        quantity = st.number_input(
                            "Quantity", min_value=1, value=1, step=1, key=f"batch_qty_{idx}"
                        )

                    notes = st.text_input(
                        "Notes (optional)",
                        placeholder="e.g. organic, for the party",
                        key=f"batch_notes_{idx}",
                    )

                    custom_threshold = None
                    with st.expander("Custom low-stock threshold (optional)"):
                        use_custom = st.checkbox(
                            "Override the default threshold for this item",
                            key=f"batch_use_threshold_{idx}",
                        )
                        if use_custom:
                            if CATEGORY_UNITS[category] == "g":
                                custom_threshold = st.number_input(
                                    "Alert when at/below (grams)",
                                    min_value=0.0,
                                    value=weight_threshold * 1.0,
                                    step=50.0,
                                    key=f"batch_threshold_{idx}",
                                )
                            else:
                                custom_threshold = st.number_input(
                                    "Alert when at/below (count)",
                                    min_value=0,
                                    value=int(count_threshold),
                                    step=1,
                                    key=f"batch_threshold_{idx}",
                                )

                    expiration_date_value = None
                    with st.expander("Expiration date (optional)"):
                        track_expiry = st.checkbox(
                            "Track expiration for this item",
                            value=True,
                            key=f"batch_track_exp_{idx}",
                        )
                        if track_expiry:
                            suggested_days = estimate_shelf_life_days(title or "", category)
                            exp_date = st.date_input(
                                "Expires on",
                                value=date.today() + timedelta(days=suggested_days),
                                key=f"batch_exp_{idx}",
                            )
                            expiration_date_value = exp_date.isoformat()

            entries.append(
                {
                    "image": image,
                    "title": title,
                    "category": category,
                    "quantity": quantity,
                    "notes": notes,
                    "custom_threshold": custom_threshold,
                    "expiration_date": expiration_date_value,
                }
            )

        if entries:
            button_label = (
                "Add to Inventory"
                if len(entries) == 1
                else f"Add all {len(entries)} items to Inventory"
            )
            if st.button(button_label, type="primary"):
                added, merged, skipped = 0, 0, 0
                for entry in entries:
                    title = entry["title"].strip()
                    if not title:
                        skipped += 1
                        continue

                    category = entry["category"]
                    quantity = entry["quantity"]
                    existing = inventory.find_item_by_title(title, category)
                    if existing:
                        new_total = existing["quantity"] + quantity
                        inventory.update_item(
                            existing["id"],
                            existing["title"],
                            existing["category"],
                            new_total,
                            existing.get("notes"),
                            None,
                            existing.get("custom_threshold"),
                            entry["expiration_date"] or existing.get("expiration_date"),
                        )
                        merged += 1
                    else:
                        image_filename = f"{uuid.uuid4().hex}.jpg"
                        entry["image"].save(IMAGES_DIR / image_filename)
                        image_path = str(Path("data/images") / image_filename)
                        inventory.add_item(
                            title,
                            category,
                            quantity,
                            image_path,
                            entry["notes"].strip() or None,
                            entry["custom_threshold"],
                            entry["expiration_date"],
                        )
                        added += 1

                st.session_state.uploader_key += 1
                summary_parts = []
                if added:
                    summary_parts.append(f"added {added}")
                if merged:
                    summary_parts.append(f"merged {merged}")
                if skipped:
                    summary_parts.append(f"skipped {skipped} (no title)")
                summary = (
                    ", ".join(summary_parts).capitalize() if summary_parts else "Nothing to add"
                )
                st.toast(summary, icon="✅")
                st.rerun()


def render_add_by_receipt() -> None:
    if "receipt_uploader_key" not in st.session_state:
        st.session_state.receipt_uploader_key = 0
    if "receipt_candidates" not in st.session_state:
        st.session_state.receipt_candidates = []

    st.caption(
        "Upload a photo of a receipt - text is read locally on your Mac (no cloud), then "
        "you review/edit each detected line before adding. OCR and receipt formats vary a "
        "lot, so always double-check before confirming."
    )
    receipt_photo = st.file_uploader(
        "Upload a receipt photo",
        type=["png", "jpg", "jpeg", "heic", "heif"],
        key=f"receipt_uploader_{st.session_state.receipt_uploader_key}",
    )
    if receipt_photo is not None:
        try:
            receipt_image = Image.open(receipt_photo).convert("RGB")
        except UnidentifiedImageError:
            st.error("Could not read that file as an image.")
            receipt_image = None

        if receipt_image is not None:
            st.image(receipt_image, caption="Receipt", width=300)
            if st.button("🔍 Scan receipt", key="scan_receipt_btn"):
                with st.spinner("Reading receipt text locally..."):
                    raw_text = receipt.ocr_receipt_image(receipt_image)
                    candidates = receipt.parse_receipt_text(raw_text)
                if candidates:
                    st.session_state.receipt_candidates = candidates
                else:
                    st.warning(
                        "Couldn't detect any item lines on that receipt. Try a clearer photo."
                    )
                st.rerun()

    if st.session_state.receipt_candidates:
        st.write(
            f"Found {len(st.session_state.receipt_candidates)} candidate line(s) - review "
            "before adding (clear a title to skip that line):"
        )
        receipt_entries = []
        for idx, candidate in enumerate(st.session_state.receipt_candidates):
            r_col1, r_col2, r_col3 = st.columns([3, 2, 1])
            with r_col1:
                r_title = st.text_input(
                    "Title",
                    value=candidate,
                    key=f"receipt_title_{idx}",
                    label_visibility="collapsed",
                )
            with r_col2:
                default_cat = guess_category(candidate)
                r_category = st.selectbox(
                    "Category",
                    CATEGORIES,
                    index=CATEGORIES.index(default_cat),
                    format_func=lambda c: f"{CATEGORY_ICONS[c]} {c}",
                    key=f"receipt_category_{idx}",
                    label_visibility="collapsed",
                )
            with r_col3:
                if CATEGORY_UNITS[r_category] == "g":
                    r_qty = st.number_input(
                        "Qty",
                        min_value=0.1,
                        value=500.0,
                        step=50.0,
                        key=f"receipt_qty_{idx}",
                        label_visibility="collapsed",
                    )
                else:
                    r_qty = st.number_input(
                        "Qty",
                        min_value=1,
                        value=1,
                        step=1,
                        key=f"receipt_qty_{idx}",
                        label_visibility="collapsed",
                    )
            receipt_entries.append(
                {"title": r_title, "category": r_category, "quantity": r_qty}
            )

        rcol1, rcol2 = st.columns(2)
        with rcol1:
            if st.button(
                f"Add all {len(receipt_entries)} items", type="primary", key="receipt_add_all"
            ):
                r_added, r_merged, r_skipped = 0, 0, 0
                for entry in receipt_entries:
                    r_title = entry["title"].strip()
                    if not r_title:
                        r_skipped += 1
                        continue
                    r_category = entry["category"]
                    r_existing = inventory.find_item_by_title(r_title, r_category)
                    if r_existing:
                        inventory.update_quantity(
                            r_existing["id"], r_existing["quantity"] + entry["quantity"]
                        )
                        r_merged += 1
                    else:
                        inventory.add_item(r_title, r_category, entry["quantity"], None)
                        r_added += 1
                st.session_state.receipt_candidates = []
                st.session_state.receipt_uploader_key += 1
                st.toast(
                    f"Receipt: added {r_added}, merged {r_merged}, skipped {r_skipped}",
                    icon="🧾",
                )
                st.rerun()
        with rcol2:
            if st.button("Discard all", key="receipt_discard_all"):
                st.session_state.receipt_candidates = []
                st.rerun()


st.divider()

# --- Main tabs ---
tab_labels = (
    ["➕ Add Items"]
    + [f"{CATEGORY_ICONS[c]} {c}" for c in CATEGORIES]
    + ["🛍️ Shopping List", "📊 Charts"]
)
tabs = st.tabs(tab_labels)
add_items_tab = tabs[0]
category_tabs = dict(zip(CATEGORIES, tabs[1:-2]))
shopping_tab = tabs[-2]
chart_tab = tabs[-1]

SORT_OPTIONS = {
    "Newest first": ("created_at", True),
    "Oldest first": ("created_at", False),
    "Name (A-Z)": ("title", False),
    "Name (Z-A)": ("title", True),
    "Quantity (high to low)": ("quantity", True),
    "Quantity (low to high)": ("quantity", False),
    "Expiring soonest": ("expiration_date", False),
}


@st.dialog("Edit item")
def edit_item_dialog(item: dict) -> None:
    title = st.text_input("Title", value=item["title"], key=f"edit_title_{item['id']}")
    category = st.selectbox(
        "Category",
        CATEGORIES,
        index=CATEGORIES.index(item["category"]),
        format_func=lambda c: f"{CATEGORY_ICONS[c]} {c}",
        key=f"edit_category_{item['id']}",
    )
    if CATEGORY_UNITS[category] == "g":
        default_grams = float(item["quantity"]) if CATEGORY_UNITS[item["category"]] == "g" else 500.0
        quantity = st.number_input(
            "Quantity (grams)",
            min_value=0.0,
            value=default_grams,
            step=50.0,
            key=f"edit_qty_{item['id']}_g",
        )
    else:
        default_count = int(item["quantity"]) if CATEGORY_UNITS[item["category"]] == "count" else 1
        quantity = st.number_input(
            "Quantity",
            min_value=0,
            value=default_count,
            step=1,
            key=f"edit_qty_{item['id']}_count",
        )
    notes = st.text_area(
        "Notes (optional)", value=item.get("notes") or "", key=f"edit_notes_{item['id']}"
    )

    existing_custom = item.get("custom_threshold")
    use_custom_threshold = st.checkbox(
        "Custom low-stock threshold for this item",
        value=existing_custom is not None,
        key=f"edit_use_threshold_{item['id']}",
    )
    custom_threshold = None
    if use_custom_threshold:
        if CATEGORY_UNITS[category] == "g":
            custom_threshold = st.number_input(
                "Alert when at/below (grams)",
                min_value=0.0,
                value=float(existing_custom) if existing_custom is not None else weight_threshold * 1.0,
                step=50.0,
                key=f"edit_threshold_{item['id']}_g",
            )
        else:
            custom_threshold = st.number_input(
                "Alert when at/below (count)",
                min_value=0,
                value=int(existing_custom) if existing_custom is not None else int(count_threshold),
                step=1,
                key=f"edit_threshold_{item['id']}_count",
            )

    new_photo = st.file_uploader(
        "Replace photo (optional)",
        type=["png", "jpg", "jpeg", "heic", "heif"],
        key=f"edit_photo_{item['id']}",
    )

    existing_exp = item.get("expiration_date")
    track_expiry = st.checkbox(
        "Track expiration for this item",
        value=existing_exp is not None,
        key=f"edit_track_exp_{item['id']}",
    )
    expiration_date_value = None
    if track_expiry:
        if existing_exp:
            default_exp_date = date.fromisoformat(existing_exp)
        else:
            default_exp_date = date.today() + timedelta(
                days=estimate_shelf_life_days(title, category)
            )
        exp_date = st.date_input("Expires on", value=default_exp_date, key=f"edit_exp_{item['id']}")
        expiration_date_value = exp_date.isoformat()

    mark_favorite = st.checkbox(
        "⭐ Favorite (enables quick re-add from the home page)",
        value=inventory.is_favorited(item["title"], item["category"]),
        key=f"edit_fav_{item['id']}",
    )
    fav_default_qty = None
    if mark_favorite:
        if CATEGORY_UNITS[category] == "g":
            fav_default_qty = st.number_input(
                "Quick-add amount (grams)",
                min_value=0.1,
                value=float(quantity) if quantity else 500.0,
                step=50.0,
                key=f"edit_fav_qty_{item['id']}_g",
            )
        else:
            fav_default_qty = st.number_input(
                "Quick-add amount",
                min_value=1,
                value=int(quantity) if quantity else 1,
                step=1,
                key=f"edit_fav_qty_{item['id']}_count",
            )

    save_col, cancel_col = st.columns(2)
    with save_col:
        if st.button("Save changes", type="primary", width="stretch"):
            if not title.strip():
                st.error("Title can't be empty.")
                st.stop()
            new_image_path = None
            if new_photo is not None:
                try:
                    new_image = Image.open(new_photo).convert("RGB")
                except UnidentifiedImageError:
                    st.error("Could not read that file as an image.")
                    st.stop()
                new_filename = f"{uuid.uuid4().hex}.jpg"
                new_image.save(IMAGES_DIR / new_filename)
                new_image_path = str(Path("data/images") / new_filename)
                old_path = BASE_DIR / item["image_path"] if item["image_path"] else None
                if old_path and old_path.exists():
                    try:
                        old_path.unlink()
                    except OSError:
                        pass
            inventory.update_item(
                item["id"],
                title,
                category,
                quantity,
                notes.strip() or None,
                new_image_path,
                custom_threshold,
                expiration_date_value,
            )
            inventory.remove_favorite(item["title"], item["category"])
            if mark_favorite:
                inventory.add_favorite(title, category, fav_default_qty)
            st.toast(f"Saved changes to '{title}'", icon="✅")
            st.rerun()
    with cancel_col:
        if st.button("Cancel", width="stretch"):
            st.rerun()


def render_items(category: str) -> None:
    undo_key = f"undo_{category}"
    if st.session_state.get(undo_key):
        deleted = st.session_state[undo_key]
        with st.container(border=True):
            u1, u2, u3 = st.columns([5, 1, 1], vertical_alignment="center")
            u1.write(f"🗑️ Removed **{deleted['title']}**")
            if u2.button("Undo", key=f"undo_btn_{category}", width="stretch"):
                inventory.add_item(
                    deleted["title"],
                    deleted["category"],
                    deleted["quantity"],
                    deleted["image_path"],
                    deleted.get("notes"),
                    deleted.get("custom_threshold"),
                    deleted.get("expiration_date"),
                )
                del st.session_state[undo_key]
                st.toast(f"Restored '{deleted['title']}'", icon="↩️")
                st.rerun()
            if u3.button("✕", key=f"dismiss_{category}", width="stretch"):
                del st.session_state[undo_key]
                st.rerun()

    filter_col1, filter_col2, filter_col3 = st.columns([2, 2, 1])
    with filter_col1:
        search = st.text_input(
            "Search", key=f"search_{category}", placeholder="Filter by name..."
        )
    with filter_col2:
        sort_option = st.selectbox("Sort by", list(SORT_OPTIONS.keys()), key=f"sort_{category}")
    with filter_col3:
        low_only = st.toggle("Low stock only", key=f"low_only_{category}")

    items = inventory.get_items_by_category(category)

    if search:
        items = [item for item in items if search.lower() in item["title"].lower()]
    if low_only:
        items = [item for item in items if item["quantity"] <= effective_threshold(item)]

    sort_key, reverse = SORT_OPTIONS[sort_option]
    if sort_key == "expiration_date":
        items = sorted(items, key=lambda item: item.get("expiration_date") or "9999-99-99")
    else:
        items = sorted(items, key=lambda item: item[sort_key], reverse=reverse)

    if not items:
        st.caption("No items match.")
        return

    dot_color = PALETTE.get(category, "#999999")
    unit = CATEGORY_UNITS[category]

    for item in items:
        item_threshold = effective_threshold(item)
        with st.container(border=True):
            c1, c2, c3, c4, c5 = st.columns([1, 3, 2, 1, 1], vertical_alignment="center")
            with c1:
                image_path = BASE_DIR / item["image_path"] if item["image_path"] else None
                if image_path and image_path.exists():
                    st.image(str(image_path), width=60)
            with c2:
                st.markdown(
                    f'<span style="display:inline-block;width:10px;height:10px;'
                    f'border-radius:50%;background:{dot_color};margin-right:6px;"></span>'
                    f'<strong>{html.escape(item["title"])}</strong> '
                    f'<span style="color:var(--text-color, #4B5B53);font-size:0.85em;">'
                    f'({format_quantity(item["quantity"], unit)})</span>',
                    unsafe_allow_html=True,
                )
                if item.get("notes"):
                    st.caption(item["notes"])
                if item.get("custom_threshold") is not None:
                    st.caption(
                        f"Custom alert at {format_quantity(item['custom_threshold'], unit)}"
                    )
                if item["quantity"] <= item_threshold:
                    st.badge("Low stock", icon="⚠️", color="orange")
                exp_days = days_until_expiration(item)
                if exp_days is not None:
                    if exp_days < 0:
                        st.badge("Expired", icon="❌", color="red")
                    elif exp_days <= EXPIRY_WARNING_DAYS:
                        exp_label = "Expires today" if exp_days == 0 else f"Expires in {exp_days}d"
                        st.badge(exp_label, icon="⏰", color="orange")
            with c3:
                if unit == "g":
                    new_qty = st.number_input(
                        "Qty",
                        min_value=0.0,
                        value=float(item["quantity"]),
                        step=50.0,
                        key=f"qty_{item['id']}",
                        label_visibility="collapsed",
                    )
                else:
                    new_qty = st.number_input(
                        "Qty",
                        min_value=0,
                        value=int(item["quantity"]),
                        step=1,
                        key=f"qty_{item['id']}",
                        label_visibility="collapsed",
                    )
                if new_qty != item["quantity"]:
                    inventory.update_quantity(item["id"], new_qty)
                    st.rerun()
            with c4:
                if st.button("✏️", key=f"edit_{item['id']}", help="Edit item"):
                    edit_item_dialog(item)
            with c5:
                if st.button("🗑️", key=f"del_{item['id']}", help="Remove item"):
                    st.session_state[undo_key] = dict(item)
                    inventory.delete_item(item["id"])
                    st.rerun()


with add_items_tab:
    add_sub_tabs = st.tabs(["📷 By Photo", "🧾 By Receipt"])
    with add_sub_tabs[0]:
        render_add_by_photo()
    with add_sub_tabs[1]:
        render_add_by_receipt()

for cat, tab in category_tabs.items():
    with tab:
        render_items(cat)

with shopping_tab:
    st.caption("Check items off as you shop. Populate it from low-stock items or add your own.")

    action_col, add_col = st.columns([1, 3])
    with action_col:
        if st.button("🔄 Add all low-stock items", width="stretch"):
            added_count = 0
            for low_item in low_stock_items:
                before = inventory.get_shopping_list()
                inventory.add_shopping_list_item(low_item["title"], low_item["category"])
                after = inventory.get_shopping_list()
                if len(after) > len(before):
                    added_count += 1
            st.toast(f"Added {added_count} low-stock item(s) to the shopping list", icon="🛍️")
            st.rerun()
    with add_col:
        with st.form("add_shopping_item_form", clear_on_submit=True):
            new_item_col, new_cat_col, new_btn_col = st.columns([3, 3, 1])
            new_item_title = new_item_col.text_input(
                "Item", placeholder="e.g. Paper towels", label_visibility="collapsed"
            )
            new_item_category = new_cat_col.selectbox(
                "Category",
                CATEGORIES,
                format_func=lambda c: f"{CATEGORY_ICONS[c]} {c}",
                label_visibility="collapsed",
            )
            if new_btn_col.form_submit_button("Add", width="stretch"):
                if new_item_title.strip():
                    inventory.add_shopping_list_item(new_item_title, new_item_category)
                    st.rerun()

    shopping_items = inventory.get_shopping_list()
    if not shopping_items:
        st.info("🛍️ Your shopping list is empty. Add items above or pull in low-stock items.")
    else:
        unchecked = [i for i in shopping_items if not i["checked"]]
        checked = [i for i in shopping_items if i["checked"]]

        for s_item in unchecked:
            with st.container(border=True):
                s_col1, s_col2 = st.columns([5, 1], vertical_alignment="center")
                with s_col1:
                    cat_icon = CATEGORY_ICONS.get(s_item["category"], "")
                    is_checked = st.checkbox(
                        f"{cat_icon} {s_item['title']}",
                        value=False,
                        key=f"shop_check_{s_item['id']}",
                    )
                    if is_checked:
                        inventory.set_shopping_item_checked(s_item["id"], True)
                        st.rerun()
                with s_col2:
                    if st.button("✕", key=f"shop_del_{s_item['id']}"):
                        inventory.delete_shopping_item(s_item["id"])
                        st.rerun()

        if checked:
            with st.expander(f"✅ Checked off ({len(checked)})"):
                for s_item in checked:
                    cat_icon = CATEGORY_ICONS.get(s_item["category"], "")
                    is_checked = st.checkbox(
                        f"{cat_icon} {s_item['title']}",
                        value=True,
                        key=f"shop_check_{s_item['id']}",
                    )
                    if not is_checked:
                        inventory.set_shopping_item_checked(s_item["id"], False)
                        st.rerun()
                if st.button("Clear checked items"):
                    inventory.clear_checked_shopping_items()
                    st.rerun()

with chart_tab:
    st.markdown("#### 📁 Items per category")
    counts_df = pd.DataFrame(
        {
            "category": CATEGORIES,
            "items": [len(inventory.get_items_by_category(c)) for c in CATEGORIES],
        }
    )
    fig_counts = px.bar(
        counts_df,
        x="category",
        y="items",
        color="category",
        color_discrete_map=PALETTE,
        text="items",
    )
    fig_counts.update_traces(marker_line_width=0, textposition="outside")
    fig_counts.update_layout(
        template=PLOTLY_TEMPLATE,
        plot_bgcolor="rgba(0,0,0,0)",
        paper_bgcolor="rgba(0,0,0,0)",
        font_family="Plus Jakarta Sans, sans-serif",
        margin=dict(l=0, r=10, t=10, b=10),
        xaxis_title="",
        yaxis_title="",
        showlegend=False,
        height=260,
    )
    st.plotly_chart(fig_counts, width="stretch")

    st.divider()

    chart_category = st.selectbox(
        "View detailed charts for",
        CATEGORIES,
        format_func=lambda c: f"{CATEGORY_ICONS[c]} {c}",
        key="chart_category_select",
    )
    unit_label = "g" if CATEGORY_UNITS[chart_category] == "g" else "count"
    cat_items = inventory.get_items_by_category(chart_category)

    st.markdown(f"#### 📦 Stock by item - {CATEGORY_ICONS[chart_category]} {chart_category}")
    if cat_items:
        item_df = (
            pd.DataFrame(cat_items)
            .groupby("title", as_index=False)["quantity"]
            .sum()
            .sort_values("quantity", ascending=True)
        )
        fig_items = px.bar(
            item_df,
            x="quantity",
            y="title",
            orientation="h",
            text="quantity",
            color_discrete_sequence=[PALETTE[chart_category]],
        )
        fig_items.update_traces(marker_line_width=0, textposition="outside")
        fig_items.update_layout(
            template=PLOTLY_TEMPLATE,
            plot_bgcolor="rgba(0,0,0,0)",
            paper_bgcolor="rgba(0,0,0,0)",
            font_family="Plus Jakarta Sans, sans-serif",
            margin=dict(l=0, r=20, t=10, b=10),
            height=max(260, 38 * len(item_df)),
            xaxis_title=f"Quantity ({unit_label})",
            yaxis_title="",
            showlegend=False,
        )
        fig_items.update_xaxes(gridcolor="rgba(15,40,25,0.08)")
        st.plotly_chart(fig_items, width="stretch")
    else:
        st.caption(f"No {chart_category.lower()} yet.")

    st.markdown(f"#### 📈 {chart_category} added over time")
    if cat_items:
        date_df = pd.DataFrame(cat_items)
        date_df["date"] = pd.to_datetime(date_df["created_at"]).dt.date.astype(str)
        date_grouped = date_df.groupby("date", as_index=False)["quantity"].sum()
        fig_time = px.area(
            date_grouped,
            x="date",
            y="quantity",
            color_discrete_sequence=[PALETTE[chart_category]],
        )
        fig_time.update_traces(
            line_width=2, fillcolor=hex_to_rgba(PALETTE[chart_category], 0.15)
        )
        fig_time.update_layout(
            template=PLOTLY_TEMPLATE,
            plot_bgcolor="rgba(0,0,0,0)",
            paper_bgcolor="rgba(0,0,0,0)",
            font_family="Plus Jakarta Sans, sans-serif",
            margin=dict(l=0, r=10, t=10, b=10),
            xaxis_title="",
            yaxis_title=f"Quantity ({unit_label})",
            height=300,
        )
        fig_time.update_xaxes(type="category", gridcolor="rgba(15,40,25,0.08)")
        fig_time.update_yaxes(gridcolor="rgba(15,40,25,0.08)")
        st.plotly_chart(fig_time, width="stretch")
    else:
        st.caption("No data yet.")
