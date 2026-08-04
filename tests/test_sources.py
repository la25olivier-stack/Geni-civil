"""Tests des parseurs de sources (SEAO XML, RSS/MERX)."""

from datetime import datetime

from conftest import load_fixture

from appels_offres.sources.seao import SeaoSource, parse_date
from appels_offres.sources.rss import RssSource


def test_seao_parse_extracts_all_records():
    src = SeaoSource(name="SEAO")
    tenders = list(src.parse(load_fixture("seao_sample.xml")))
    assert len(tenders) == 3

    first = tenders[0]
    assert first.reference == "1450001"
    assert first.organization == "Ville de Saint-Hyacinthe"
    assert first.category == "Travaux de construction"
    assert first.location == "Montérégie"
    assert first.url == "https://www.seao.ca/avis/1450001"
    assert first.published_at == datetime(2026, 8, 1, 9, 0, 0)
    assert first.closing_at == datetime(2026, 8, 28, 11, 0, 0)
    assert "pavage" in first.description.lower()
    assert first.source == "SEAO"


def test_seao_uid_is_stable():
    src = SeaoSource(name="SEAO")
    a = list(src.parse(load_fixture("seao_sample.xml")))
    b = list(src.parse(load_fixture("seao_sample.xml")))
    assert a[0].uid == b[0].uid
    assert a[0].uid != a[1].uid


def test_parse_date_handles_multiple_formats():
    assert parse_date("2026-08-01T09:00:00") == datetime(2026, 8, 1, 9, 0)
    assert parse_date("2026-08-01") == datetime(2026, 8, 1)
    assert parse_date("01/08/2026") == datetime(2026, 8, 1)
    assert parse_date("2026-08-01T09:00:00+00:00") == datetime(2026, 8, 1, 9, 0)
    assert parse_date("") is None
    assert parse_date("pas une date") is None


def test_seao_field_override():
    src = SeaoSource(
        name="SEAO",
        options={"fields": {"title": "organisme"}},
    )
    tenders = list(src.parse(load_fixture("seao_sample.xml")))
    # Le titre est désormais tiré de la balise <organisme>.
    assert tenders[0].title == "Ville de Saint-Hyacinthe"


def test_rss_parse_merx():
    src = RssSource(name="MERX", options={"category": "appel d'offres public"})
    tenders = list(src.parse(load_fixture("merx_sample.xml")))
    assert len(tenders) == 2

    ponceau = tenders[0]
    assert "ponceau" in ponceau.title.lower()
    assert ponceau.url == "https://www.merx.com/opportunity/990011"
    assert ponceau.reference == "merx-990011"
    assert ponceau.category == "appel d'offres public"
    assert ponceau.published_at == datetime(2026, 8, 2, 12, 0, 0)
    assert ponceau.source == "MERX"


def test_rss_closing_regex():
    src = RssSource(
        name="MERX",
        options={"closing_regex": r"Clôture:\s*(?P<date>\d{4}-\d{2}-\d{2})"},
    )
    tenders = list(src.parse(load_fixture("merx_sample.xml")))
    assert tenders[0].closing_at == datetime(2026, 8, 30)


def test_collect_swallows_fetch_errors():
    # URL absente -> fetch_raw lève, collect() renvoie [] sans propager.
    src = SeaoSource(name="SEAO")
    assert src.collect() == []
