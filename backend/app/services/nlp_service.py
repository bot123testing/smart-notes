"""
NLP Service — TF-IDF + Cosine Similarity
=========================================
Pure-Python implementation. No external NLP dependencies required.

Pipeline
--------
  tokenise(text)
    → lowercase, strip punctuation, remove stopwords, filter short tokens
  tfidf_vectors(corpus: dict[id, text])
    → dict[id, dict[term, score]]
  cosine_similarity(vec_a, vec_b)
    → float in [0, 1]
  suggest_links(source_id, source_text, corpus, top_n=3)
    → list[{note_id, score}] sorted by score desc
"""

import math
import re
from typing import Any

# Basic English stopwords — no NLTK needed
_STOPWORDS = {
    "a","an","the","and","or","but","in","on","at","to","for","of","with",
    "is","it","its","be","as","was","are","were","been","has","have","had",
    "do","does","did","not","no","so","if","by","from","up","out","this",
    "that","these","those","my","your","our","their","we","you","i","he",
    "she","they","what","which","who","how","when","where","will","would",
    "can","could","should","may","might","shall","just","also","about","more",
    "than","then","there","here","into","over","after","before","because","all",
    "any","each","few","only","own","same","other","such","very","s","t",
}

_TOKEN_RE = re.compile(r"[a-z]{3,}")   # at least 3 chars, letters only


def _tokenise(text: str) -> list[str]:
    tokens = _TOKEN_RE.findall(text.lower())
    return [t for t in tokens if t not in _STOPWORDS]


def _term_freq(tokens: list[str]) -> dict[str, float]:
    if not tokens:
        return {}
    count: dict[str, int] = {}
    for t in tokens:
        count[t] = count.get(t, 0) + 1
    n = len(tokens)
    return {t: c / n for t, c in count.items()}


def _tfidf_vectors(corpus: dict[str, str]) -> dict[str, dict[str, float]]:
    """
    Compute TF-IDF vectors for each document in corpus.
    corpus: {doc_id: raw_text}
    Returns: {doc_id: {term: tfidf_score}}
    """
    # Tokenise all docs
    tokenised: dict[str, list[str]] = {did: _tokenise(text) for did, text in corpus.items()}
    n = len(corpus)

    # Document frequency per term
    df: dict[str, int] = {}
    for tokens in tokenised.values():
        for t in set(tokens):
            df[t] = df.get(t, 0) + 1

    # TF-IDF per doc
    vectors: dict[str, dict[str, float]] = {}
    for did, tokens in tokenised.items():
        tf = _term_freq(tokens)
        vec: dict[str, float] = {}
        for term, tf_score in tf.items():
            idf = math.log((n + 1) / (df.get(term, 0) + 1)) + 1   # smoothed IDF
            vec[term] = round(tf_score * idf, 6)
        vectors[did] = vec
    return vectors


def _cosine(vec_a: dict[str, float], vec_b: dict[str, float]) -> float:
    if not vec_a or not vec_b:
        return 0.0
    common = set(vec_a) & set(vec_b)
    dot = sum(vec_a[t] * vec_b[t] for t in common)
    mag_a = math.sqrt(sum(v * v for v in vec_a.values()))
    mag_b = math.sqrt(sum(v * v for v in vec_b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return round(dot / (mag_a * mag_b), 4)


def suggest_links(
    source_id: str,
    corpus: dict[str, str],   # {note_id: "title content"} for ALL notes (incl. source)
    top_n: int = 3,
    min_score: float = 0.05,  # ignore near-zero similarity
) -> list[dict[str, Any]]:
    """
    Return top_n most similar notes to source_id, excluding itself.
    Each entry: {"note_id": str, "score": float}
    """
    if len(corpus) < 2:
        return []

    vectors = _tfidf_vectors(corpus)
    src_vec = vectors.get(source_id, {})

    scored = []
    for did, vec in vectors.items():
        if did == source_id:
            continue
        score = _cosine(src_vec, vec)
        if score >= min_score:
            scored.append({"note_id": did, "score": score})

    scored.sort(key=lambda x: -x["score"])
    return scored[:top_n]
