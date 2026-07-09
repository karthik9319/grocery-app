"""Receipt OCR: extract raw text from a receipt photo and parse candidate item names.

Uses pytesseract (a thin wrapper around the Tesseract OCR engine, installed locally via
`brew install tesseract`) - runs fully offline, no cloud API/key needed.
"""
import re

from PIL import Image

NOISE_KEYWORDS = [
    "total", "subtotal", "tax", "cash", "change", "visa", "mastercard", "debit",
    "credit", "balance", "thank you", "receipt", "cashier", "auth", "card",
    "tender", "amount due", "savings", "discount", "member", "loyalty", "store",
]

PRICE_PATTERN = re.compile(r"\$?\s*\d+\.\d{2}\s*$")
LEADING_QTY_PATTERN = re.compile(r"^\d+\s*[xX]?\s*")


def ocr_receipt_image(image: Image.Image) -> str:
    """Run local OCR on a receipt photo and return the raw extracted text."""
    import pytesseract

    return pytesseract.image_to_string(image)


def parse_receipt_text(raw_text: str) -> list:
    """Return a list of candidate item name strings extracted from OCR'd receipt text.

    This is a best-effort heuristic (strip trailing prices, skip obvious
    total/tax/payment noise lines). It is always meant to be reviewed/edited by a
    human before being added to inventory, not trusted blindly - receipt formats
    vary too much across stores for fully automatic parsing.
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
        name_part = LEADING_QTY_PATTERN.sub("", name_part).strip(" -.:*")
        if len(name_part) >= 2 and not name_part.replace(".", "").replace(" ", "").isdigit():
            candidates.append(name_part.title())
    return candidates
