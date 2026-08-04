"""Tests du résumé extractif et du digest."""

from datetime import datetime

from appels_offres.digest import build_markdown, build_text
from appels_offres.models import Tender
from appels_offres.summarize import summarize

NOW = datetime(2026, 8, 4, 8, 0, 0)


def _tender():
    return Tender(
        source="SEAO",
        title="Réfection de chaussée",
        organization="Ville de Saint-Hyacinthe",
        category="Travaux de construction",
        location="Montérégie",
        closing_at=datetime(2026, 8, 14, 11, 0),
        estimated_value="1 250 000 $",
        description="Travaux de pavage et de drainage sur 800 mètres.",
        matched_keywords=["voirie", "pavage"],
    )


def test_summary_contains_key_fields():
    s = summarize(_tender(), now=NOW)
    assert "Ville de Saint-Hyacinthe" in s
    assert "Travaux de construction" in s
    assert "Montérégie" in s
    assert "clôture dans 10 jours" in s.lower()
    assert "1 250 000" in s


def test_summary_deadline_variants():
    t = _tender()
    t.closing_at = datetime(2026, 8, 4, 11, 0)
    assert "aujourd'hui" in summarize(t, now=NOW).lower()
    t.closing_at = datetime(2026, 8, 1, 11, 0)
    assert "clôturé" in summarize(t, now=NOW).lower()
    t.closing_at = None
    assert "non précisée" in summarize(t, now=NOW).lower()


def test_build_markdown_and_text():
    tenders = [_tender()]
    md = build_markdown(tenders, now=NOW)
    assert "Veille appels d'offres" in md
    assert "Réfection de chaussée" in md
    assert "| # | Source |" in md

    txt = build_text(tenders, now=NOW)
    assert "1. [SEAO] Réfection de chaussée" in txt


def test_empty_digest():
    md = build_markdown([], now=NOW)
    assert "Aucun nouvel appel d'offres" in md
