"""Évaluation de la pertinence des appels d'offres.

Score simple et déterministe (aucun LLM) :
  * +1 par mot-clé standard trouvé
  * +2 par mot-clé « fort » (très discriminant) trouvé
  * +1 si la catégorie de l'avis correspond à une catégorie ciblée
  * exclusion immédiate (score = 0) si un mot-clé d'exclusion est présent

La comparaison est insensible à la casse et aux accents, et respecte les
frontières de mots pour éviter les faux positifs (ex. « pont » ne matche pas
« ponton »… en réalité si, mais « éPONtage » non).
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime

from .config import RelevanceConfig
from .models import Tender

_FAR_FUTURE = datetime.max


def _normalize(text: str) -> str:
    """Minuscule + suppression des accents pour une comparaison robuste."""
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def _compile(keywords: list[str]) -> list[tuple[str, re.Pattern]]:
    patterns = []
    for kw in keywords:
        norm = _normalize(kw.strip())
        if not norm:
            continue
        # Frontières de mots ; les espaces internes tolèrent plusieurs espaces.
        parts = [re.escape(p) for p in norm.split()]
        pattern = re.compile(r"\b" + r"\s+".join(parts) + r"\b")
        patterns.append((kw.strip(), pattern))
    return patterns


class RelevanceFilter:
    def __init__(self, config: RelevanceConfig):
        self.config = config
        self._keywords = _compile(config.keywords)
        self._strong = _compile(config.strong_keywords)
        self._exclude = _compile(config.exclude_keywords)
        self._categories = [_normalize(c) for c in config.categories]

    def score(self, tender: Tender) -> tuple[float, list[str]]:
        blob = _normalize(tender.text_blob())

        for _, pattern in self._exclude:
            if pattern.search(blob):
                return 0.0, []

        matched: list[str] = []
        total = 0.0

        for label, pattern in self._strong:
            if pattern.search(blob):
                matched.append(label)
                total += 2.0
        for label, pattern in self._keywords:
            if pattern.search(blob) and label not in matched:
                matched.append(label)
                total += 1.0

        if self._categories:
            cat = _normalize(tender.category)
            if any(c and c in cat for c in self._categories):
                total += 1.0

        return total, matched

    def apply(self, tenders: list[Tender]) -> list[Tender]:
        """Annote et filtre : ne garde que les avis au-dessus du seuil."""
        kept: list[Tender] = []
        for tender in tenders:
            score, matched = self.score(tender)
            tender.relevance_score = score
            tender.matched_keywords = matched
            if score >= self.config.min_score:
                kept.append(tender)
        # Les plus pertinents d'abord, puis les échéances les plus proches.
        kept.sort(
            key=lambda t: (
                -t.relevance_score,
                t.closing_at or _FAR_FUTURE,
            )
        )
        return kept
