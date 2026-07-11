"""Receipt OCR: extract raw text from a receipt photo and parse candidate item names.

Uses PaddleOCR (a deep-learning text detection + recognition pipeline, running fully
local/offline once its model weights are cached on first use - no cloud API/key
needed) - switched from Tesseract because PaddleOCR's learned text detector is far more
robust to real phone photos: cluttered/patterned backgrounds, uneven lighting, and
multi-column receipt layouts all confused Tesseract badly (see git history for the
older Tesseract-based preprocessing this replaced), while PaddleOCR reads them cleanly
with no manual tuning. The trade-off is speed: CPU-only inference takes on the order of
10-20 seconds per scan (vs near-instant for Tesseract), so this is only worth it because
scanning a receipt is an occasional, explicitly-triggered action, not a hot path.
"""
import re
from typing import Optional

import numpy as np
from PIL import Image, ImageOps

NOISE_KEYWORDS = [
    "total", "subtotal", "tax", "cash", "change", "visa", "mastercard", "debit",
    "credit", "balance", "thank you", "receipt", "cashier", "auth", "card",
    "tender", "amount due", "savings", "discount", "member", "loyalty", "store",
]

PRICE_PATTERN = re.compile(r"\$?\s*\d+\.\d{2}\s*$")
LEADING_QTY_PATTERN = re.compile(r"^(\d+)\s*[xX]\s*|^(\d+)\s+(?=[A-Za-z])")
WEIGHT_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*(lbs?|kgs?|grams?|g|oz|ounces?)\b", re.IGNORECASE)

# Convert a parsed weight into grams (the unit Vegetables/weight-based categories use).
UNIT_TO_GRAMS = {
    "g": 1, "gram": 1, "grams": 1,
    "kg": 1000, "kgs": 1000,
    "lb": 453.592, "lbs": 453.592,
    "oz": 28.3495, "ounce": 28.3495, "ounces": 28.3495,
}


def _largest_run(mask: "np.ndarray") -> Optional[tuple]:
    """Return (start, end) of the longest contiguous run of True in a 1D boolean array,
    or None if it's all False."""
    best_start = None
    best_len = 0
    cur_start = None
    cur_len = 0
    for i, v in enumerate(mask):
        if v:
            if cur_start is None:
                cur_start = i
            cur_len += 1
            if cur_len > best_len:
                best_len = cur_len
                best_start = cur_start
        else:
            cur_start = None
            cur_len = 0
    if best_start is None:
        return None
    return best_start, best_start + best_len


def crop_to_receipt(image: Image.Image) -> Image.Image:
    """Best-effort: many real phone photos show the receipt lying on a table/rug/desk
    with a lot of background around it (busy patterns, wood grain, etc.) - Tesseract
    gets badly confused trying to OCR that background texture too, often producing
    near-total garbage even though the receipt itself is perfectly legible. Since a
    receipt is virtually always printed on much-brighter paper than whatever surface
    it's sitting on, this finds the bright region's bounding box (by column, then by row
    within those columns) and crops to it. Falls back to the original, uncropped image
    if no confident bright region is found (e.g. the receipt already fills the frame, or
    is on an already-light background) - this is a heuristic, so it never applies a
    crop it isn't reasonably confident about.
    """
    gray = np.asarray(ImageOps.grayscale(image))
    bright = gray > 150

    col_run = _largest_run(bright.mean(axis=0) > 0.6)
    if col_run is None:
        return image
    left, right = col_run
    width_frac = (right - left) / gray.shape[1]
    # Too narrow: probably just noise, not a real receipt-vs-background contrast. Too
    # wide (near the full image): there's nothing meaningful to crop out.
    if width_frac < 0.15 or width_frac > 0.98:
        return image

    row_run = _largest_run(bright[:, left:right].mean(axis=1) > 0.5)
    top, bottom = row_run if row_run is not None else (0, gray.shape[0])

    pad_x = round((right - left) * 0.03)
    pad_y = round((bottom - top) * 0.02)
    left = max(0, left - pad_x)
    right = min(gray.shape[1], right + pad_x)
    top = max(0, top - pad_y)
    bottom = min(gray.shape[0], bottom + pad_y)
    return image.crop((left, top, right, bottom))


def preprocess_receipt_image(image: Image.Image) -> Image.Image:
    """Clean up a phone-camera receipt photo before OCR: crop to the receipt's bright
    region (see crop_to_receipt) to cut out background clutter, then cap the resolution
    - PaddleOCR's CPU inference time scales heavily with pixel count, and modern phone
    photos (10-50MP) are far more detail than the recognizer needs; capping the long
    side at 1600px keeps a scan to roughly 15-20 seconds instead of 30-40+ on a full-
    resolution photo, with no meaningfully worse read quality in testing. Very small/
    low-res images are upscaled a bit instead, since too little detail hurts accuracy.
    """
    processed = crop_to_receipt(image)

    long_side = max(processed.size)
    target = 1600
    if long_side > target or long_side < 900:
        scale = target / long_side
        processed = processed.resize(
            (round(processed.width * scale), round(processed.height * scale)),
            Image.Resampling.LANCZOS,
        )
    return processed


_ocr_engine = None


def _get_ocr_engine():
    """Lazily construct (and cache) the PaddleOCR pipeline - constructing it loads model
    weights from disk, so this is done once per process (first receipt scan pays that
    ~1-2s cost, every scan after reuses the same instance) rather than per-request.
    Uses the "mobile" (smallest/fastest) PP-OCRv5 detection+recognition models - the
    larger "server"/"medium" tiers were noticeably slower (2x+) with no meaningful
    accuracy improvement on real receipt photos in testing. Document-orientation/
    unwarping/textline-orientation sub-pipelines are disabled since they're for scanned
    documents/rotated photos, not needed here (our own crop_to_receipt already isolates
    the receipt, and the phone photos are already upright).
    """
    global _ocr_engine
    if _ocr_engine is None:
        from paddleocr import PaddleOCR

        _ocr_engine = PaddleOCR(
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="PP-OCRv5_mobile_rec",
        )
    return _ocr_engine


def ocr_receipt_image(image: Image.Image) -> str:
    """Run local OCR on a receipt photo and return the raw extracted text (one line per
    detected text region, in PaddleOCR's own reading-order - not necessarily left-to-
    right per physical row for multi-column receipt layouts, but every item name still
    ends up as its own clean line, which is all parse_receipt_text needs).

    Preprocesses the image first (see preprocess_receipt_image).
    """
    processed = preprocess_receipt_image(image)
    array = np.array(processed.convert("RGB"))
    engine = _get_ocr_engine()
    lines = []
    for result in engine.predict(array):
        lines.extend(result.get("rec_texts", []))
    return "\n".join(lines)


def parse_receipt_text(raw_text: str) -> list:
    """Return a list of candidate {title, quantity, weight_grams} dicts extracted from
    OCR'd receipt text. `quantity` is a parsed leading count (e.g. "2x Milk" -> 2), and
    `weight_grams` is a parsed weight amount (e.g. "1.5 lb Bananas" -> ~680g) - both are
    None when nothing could be confidently parsed from that line, in which case the
    caller should fall back to its own default. This is a best-effort heuristic (strip
    trailing prices, skip obvious total/tax/payment noise lines, then look for a
    leading count OR an inline weight+unit). It is always meant to be reviewed/edited by
    a human before being added to inventory, not trusted blindly - receipt formats vary
    too much across stores for fully automatic parsing.
    """
    candidates = []
    for line in raw_text.splitlines():
        line = line.strip()
        if len(line) < 2:
            continue
        lower = line.lower()
        if any(keyword in lower for keyword in NOISE_KEYWORDS):
            continue
        match = PRICE_PATTERN.search(line)
        name_part = line[: match.start()] if match else line

        quantity = None
        weight_grams = None
        weight_match = WEIGHT_PATTERN.search(name_part)
        if weight_match:
            amount = float(weight_match.group(1))
            unit = weight_match.group(2).lower()
            weight_grams = round(amount * UNIT_TO_GRAMS.get(unit, 1), 1)
            name_part = name_part[: weight_match.start()] + name_part[weight_match.end():]
        else:
            qty_match = LEADING_QTY_PATTERN.match(name_part)
            if qty_match:
                quantity = int(qty_match.group(1) or qty_match.group(2))
                name_part = name_part[qty_match.end():]

        name_part = name_part.strip(" -.:*")
        if len(name_part) >= 2 and not name_part.replace(".", "").replace(" ", "").isdigit():
            candidates.append(
                {"title": name_part.title(), "quantity": quantity, "weight_grams": weight_grams}
            )
    return candidates
