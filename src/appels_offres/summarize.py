"""Résumé extractif des appels d'offres (sans LLM).

Produit un résumé court et déterministe à partir des champs structurés : titre,
organisme, catégorie, lieu, échéance (avec compte à rebours) et un extrait de
la description. Aucune clé API n'est nécessaire.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

from .models import Tender

_WS = re.compile(r"\s+")


def _sentence_extract(text: str, max_len: int = 280) -> str:
    """Garde les premières phrases sans dépasser `max_len` caractères."""
    text = _WS.sub(" ", text or "").strip()
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    # Coupe à la dernière fin de phrase avant la limite, sinon au dernier mot.
    window = text[:max_len]
    cut = max(window.rfind(". "), window.rfind("! "), window.rfind("? "))
    if cut >= 60:
        return window[: cut + 1]
    cut = window.rfind(" ")
    return (window[:cut] if cut > 0 else window).rstrip() + "…"


def _format_deadline(closing: Optional[datetime], now: Optional[datetime]) -> str:
    if not closing:
        return "échéance non précisée"
    now = now or datetime.now()
    days = (closing.date() - now.date()).days
    stamp = closing.strftime("%Y-%m-%d")
    if days < 0:
        return f"clôturé le {stamp}"
    if days == 0:
        return f"clôture aujourd'hui ({stamp})"
    if days == 1:
        return f"clôture demain ({stamp})"
    return f"clôture dans {days} jours ({stamp})"


def summarize(tender: Tender, now: Optional[datetime] = None) -> str:
    """Résumé d'une phrase-clé + contexte, orienté décision rapide."""
    bits: list[str] = []

    lead = tender.organization or tender.source
    if tender.category:
        bits.append(f"{lead} — {tender.category}.")
    else:
        bits.append(f"{lead}.")

    if tender.location:
        bits.append(f"Lieu : {tender.location}.")

    bits.append(_format_deadline(tender.closing_at, now).capitalize() + ".")

    if tender.estimated_value:
        bits.append(f"Valeur estimée : {tender.estimated_value}.")

    excerpt = _sentence_extract(tender.description)
    if excerpt and _normalize(excerpt) != _normalize(tender.title):
        bits.append(excerpt)

    if tender.matched_keywords:
        bits.append("Mots-clés : " + ", ".join(tender.matched_keywords[:6]) + ".")

    return " ".join(b for b in bits if b).strip()


def _normalize(text: str) -> str:
    return _WS.sub(" ", (text or "").lower()).strip()
