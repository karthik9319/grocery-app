"""Lightweight, fully-local text classifier that guesses an item's category from its
title - no cloud calls, no heavy deep-learning deps (torch/transformers were
deliberately removed from this project in v1.2; this stays "simple" on purpose).

Uses a scikit-learn pipeline: character n-gram TF-IDF (robust to plurals/typos/word
boundaries, e.g. "tomatoe"/"tomatoes"/"tomato sauce" all still resolve sensibly) feeding
a LogisticRegression classifier. Trained from whatever (title, category) examples the
caller supplies - api.py trains it from COMMON_ITEMS plus the user's own existing
inventory titles, so it improves as their data grows.
"""
from typing import Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

_model: Optional[Pipeline] = None


def train(training_pairs: list) -> None:
    """(Re)train the module-level model from a list of (title, category) tuples.
    No-ops (leaves the model untrained/cleared) if there isn't enough data yet -
    LogisticRegression needs at least 2 distinct classes."""
    global _model
    titles = [t for t, _ in training_pairs]
    labels = [c for _, c in training_pairs]
    if len(set(labels)) < 2:
        _model = None
        return
    pipeline = Pipeline(
        [
            ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), min_df=1)),
            ("clf", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]
    )
    pipeline.fit(titles, labels)
    _model = pipeline


def predict(title: str) -> Optional[str]:
    """Predict a category for `title`, or None if the model isn't trained/ready yet, or
    if it isn't at least reasonably confident (with such a small "simple" training set,
    a low-confidence guess on a totally unrelated word is worse than just falling back
    to the caller's own default)."""
    if _model is None or not title.strip():
        return None
    try:
        proba = _model.predict_proba([title])[0]
        best_idx = proba.argmax()
        if proba[best_idx] < 0.4:
            return None
        return _model.classes_[best_idx]
    except Exception:
        return None
