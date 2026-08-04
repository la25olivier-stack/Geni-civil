"""Tests du filtre de pertinence."""

from appels_offres.config import RelevanceConfig
from appels_offres.filters import RelevanceFilter
from appels_offres.models import Tender


def _filter():
    cfg = RelevanceConfig(
        min_score=2,
        strong_keywords=["génie civil", "voirie", "aqueduc"],
        keywords=["route", "béton", "pont", "ingénierie"],
        categories=["travaux de construction"],
        exclude_keywords=["mobilier"],
    )
    return RelevanceFilter(cfg)


def test_strong_keyword_scores_two():
    f = _filter()
    t = Tender(source="SEAO", title="Travaux de voirie municipale")
    score, matched = f.score(t)
    assert score >= 2
    assert "voirie" in matched


def test_accent_and_case_insensitive():
    f = _filter()
    t = Tender(source="SEAO", title="GENIE CIVIL et ingenierie")
    score, matched = f.score(t)
    assert "génie civil" in matched
    assert "ingénierie" in matched


def test_exclusion_zeroes_score():
    f = _filter()
    t = Tender(
        source="SEAO",
        title="Fourniture de mobilier",
        description="voirie aqueduc béton",  # mots forts présents
    )
    score, matched = f.score(t)
    assert score == 0
    assert matched == []


def test_category_bonus():
    f = _filter()
    t = Tender(source="SEAO", title="Projet", category="Travaux de construction")
    score, _ = f.score(t)
    assert score >= 1


def test_word_boundary_avoids_false_positive():
    f = _filter()
    # « déroute » ne doit pas matcher « route ».
    t = Tender(source="X", title="Analyse qui déroute les experts")
    score, matched = f.score(t)
    assert "route" not in matched


def test_apply_filters_and_sorts():
    f = _filter()
    tenders = [
        Tender(source="A", title="Note interne sans intérêt"),
        Tender(source="B", title="Travaux de voirie et route en béton"),
        Tender(source="C", title="Réfection route"),
    ]
    kept = f.apply(tenders)
    assert [t.source for t in kept] == ["B"] or kept[0].source == "B"
    assert all(t.relevance_score >= 2 for t in kept)
    # tri décroissant par score
    scores = [t.relevance_score for t in kept]
    assert scores == sorted(scores, reverse=True)
