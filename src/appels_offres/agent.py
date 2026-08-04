"""Orchestration de l'agent : collecte → filtre → dédup → digest → livraison."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from .config import Config
from .digest import build_html, build_markdown, build_text
from .filters import RelevanceFilter
from .models import Tender
from .sources import build_source
from .store import SeenStore

logger = logging.getLogger(__name__)


@dataclass
class RunResult:
    collected: int = 0
    relevant: list[Tender] = field(default_factory=list)
    markdown: str = ""
    html: str = ""
    text: str = ""
    digest_path: Optional[Path] = None
    email_sent: bool = False
    email_error: str = ""


class Agent:
    def __init__(self, config: Config):
        self.config = config
        self.filter = RelevanceFilter(config.relevance)
        self.store = SeenStore(config.state_file)

    def collect(self, timeout: int = 30) -> list[Tender]:
        tenders: list[Tender] = []
        for src_cfg in self.config.sources:
            if not src_cfg.enabled:
                logger.info("Source %s désactivée, ignorée.", src_cfg.name)
                continue
            source = build_source(src_cfg)
            tenders.extend(source.collect(timeout=timeout))
        return tenders

    def _within_lookback(self, tender: Tender, now: datetime) -> bool:
        if self.config.lookback_days <= 0 or tender.published_at is None:
            return True  # sans date, on ne rejette pas
        cutoff = now - timedelta(days=self.config.lookback_days)
        return tender.published_at >= cutoff

    def run(
        self,
        *,
        now: Optional[datetime] = None,
        timeout: int = 30,
        deliver: bool = True,
        write_digest: bool = True,
        update_state: bool = True,
        tenders: Optional[list[Tender]] = None,
    ) -> RunResult:
        """Exécute un cycle complet. `tenders` permet d'injecter des avis (tests)."""
        now = now or datetime.now()
        result = RunResult()

        if tenders is None:
            tenders = self.collect(timeout=timeout)
        result.collected = len(tenders)

        recent = [t for t in tenders if self._within_lookback(t, now)]
        relevant = self.filter.apply(recent)
        fresh = self.store.filter_new(relevant)

        result.relevant = fresh
        result.markdown = build_markdown(fresh, now=now)
        result.html = build_html(fresh, now=now)
        result.text = build_text(fresh, now=now)

        logger.info(
            "Collectés: %d | récents: %d | pertinents: %d | nouveaux: %d",
            result.collected, len(recent), len(relevant), len(fresh),
        )

        if write_digest:
            result.digest_path = self._write_digest(result.markdown, now)

        if deliver and fresh:
            result.email_sent, result.email_error = self._deliver(result, now)

        if update_state and fresh:
            self.store.mark(fresh)
            self.store.save()

        return result

    def _write_digest(self, markdown: str, now: datetime) -> Path:
        out_dir = Path(self.config.output_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"digest-{now.strftime('%Y-%m-%d')}.md"
        path.write_text(markdown, encoding="utf-8")
        logger.info("Digest écrit : %s", path)
        return path

    def _deliver(self, result: RunResult, now: datetime) -> tuple[bool, str]:
        email_cfg = self.config.email
        if not email_cfg.enabled:
            return False, "livraison courriel désactivée"
        # Import tardif : évite de charger smtplib quand la livraison est off.
        from .delivery import EmailDeliveryError, send_email

        subject = (
            f"{len(result.relevant)} appel(s) d'offres — "
            f"{now.strftime('%Y-%m-%d')}"
        )
        try:
            send_email(email_cfg, subject, result.text, result.html)
            logger.info("Courriel envoyé à %s", email_cfg.recipient)
            return True, ""
        except EmailDeliveryError as exc:
            logger.warning("Courriel non envoyé : %s", exc)
            return False, str(exc)
