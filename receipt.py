"""Receipt OCR: extract raw text from a receipt photo and parse candidate item names.

Uses pytesseract (a thin wrapper around the Tesseract OCR engine, installed locally via
`brew install tesseract`) - runs fully offline, no cloud API/key needed.
"""
import re

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


def preprocess_receipt_image(image: Image.Image) -> Image.Image:
    """Clean up a phone-camera receipt photo before OCR. Real receipt photos are often
    low-contrast, unevenly lit, and/or low-resolution - all of which trip up Tesseract
    badly if fed in raw. This applies grayscale + contrast stretching + upscaling of
    small photos, which are the standard, safe (non-destructive) preprocessing steps
    for this - deliberately NOT doing hard black/white thresholding, since a fixed
    threshold can wipe out text sitting in a shadowed part of the receipt.
    """
    processed = ImageOps.grayscale(image)
    processed = ImageOps.autocontrast(processed, cutoff=1)

    # Upscale small/low-res photos - Tesseract accuracy drops off sharply below
    # roughly 300dpi-equivalent detail (rule of thumb: long side >= ~1800px).
    long_side = max(processed.size)
    if long_side < 1800:
        scale = 1800 / long_side
        processed = processed.resize(
            (round(processed.width * scale), round(processed.height * scale)),
            Image.Resampling.LANCZOS,
        )
    return processed


def ocr_receipt_image(image: Image.Image) -> str:
    """Run local OCR on a receipt photo and return the raw extracted text.

    Preprocesses the image first (see preprocess_receipt_image), and uses PSM 6
    ("assume a single uniform block of text") instead of Tesseract's default automatic
    page-segmentation mode - PSM 6 is the commonly-recommended mode for narrow,
    single-column receipts and reduces line-reordering/garbling versus the default.
    """
    import pytesseract

    processed = preprocess_receipt_image(image)
    return pytesseract.image_to_string(processed, config="--psm 6")


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
