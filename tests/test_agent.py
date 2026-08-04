"""Test d'intégration de l'orchestration (collecte injectée -> digest)."""

from datetime import datetime

from conftest import load_fixture

from appels_offres.agent import Agent
from appels_offres.config import (
    Config, EmailConfig, RelevanceConfig,
)
from appels_offres.sources.rss import RssSource
from appels_offres.sources.seao import SeaoSource

NOW = datetime(2026, 8, 4, 8, 0, 0)


def _config(tmp_path):
    return Config(
        lookback_days=7,
        state_file=str(tmp_path / "seen.json"),
        output_dir=str(tmp_path / "digests"),
        relevance=RelevanceConfig(
            min_score=2,
            strong_keywords=["voirie", "aqueduc", "surveillance de chantier"],
            keywords=["route", "chaussée", "pavage", "ponceau",
                      "terrassement", "béton", "ingénierie", "drainage"],
            categories=["travaux de construction", "services professionnels"],
            exclude_keywords=["mobilier", "logiciel"],
        ),
        email=EmailConfig(enabled=False, recipient="x@example.com"),
    )


def _all_tenders():
    seao = list(SeaoSource(name="SEAO").parse(load_fixture("seao_sample.xml")))
    merx = list(RssSource(name="MERX").parse(load_fixture("merx_sample.xml")))
    return seao + merx


def test_run_filters_and_writes_digest(tmp_path):
    agent = Agent(_config(tmp_path))
    result = agent.run(
        now=NOW, deliver=False, tenders=_all_tenders(),
    )
    # 5 avis collectés ; le mobilier et le logiciel sont écartés -> 3 pertinents.
    assert result.collected == 5
    titles = [t.title for t in result.relevant]
    assert any("chaussée" in t.lower() for t in titles)
    assert any("aqueduc" in t.lower() for t in titles)
    assert any("ponceau" in t.lower() for t in titles)
    assert not any("mobilier" in t.lower() for t in titles)
    assert not any("logiciel" in t.lower() for t in titles)

    assert result.digest_path is not None
    assert result.digest_path.exists()
    assert "Veille appels d'offres" in result.digest_path.read_text(encoding="utf-8")


def test_deduplication_across_runs(tmp_path):
    cfg = _config(tmp_path)
    agent = Agent(cfg)
    first = agent.run(now=NOW, deliver=False, tenders=_all_tenders())
    assert len(first.relevant) == 3

    # Deuxième exécution avec les mêmes avis : rien de nouveau.
    agent2 = Agent(cfg)
    second = agent2.run(now=NOW, deliver=False, tenders=_all_tenders())
    assert second.relevant == []


def test_lookback_excludes_old(tmp_path):
    cfg = _config(tmp_path)
    cfg.lookback_days = 1  # seuls les avis du 2026-08-03/04 restent
    agent = Agent(cfg)
    result = agent.run(now=NOW, deliver=False, tenders=_all_tenders())
    for t in result.relevant:
        assert t.published_at is None or t.published_at >= datetime(2026, 8, 3)
