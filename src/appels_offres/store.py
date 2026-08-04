"""Persistance minimale des avis déjà vus (déduplication entre exécutions)."""

from __future__ import annotations

import json
from pathlib import Path

from .models import Tender


class SeenStore:
    """Mémorise les identifiants d'avis déjà signalés dans un fichier JSON."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._seen: set[str] = set()
        self._load()

    def _load(self) -> None:
        if self.path.exists():
            try:
                data = json.loads(self.path.read_text(encoding="utf-8"))
                self._seen = set(data.get("seen", []))
            except (json.JSONDecodeError, OSError):
                self._seen = set()

    def is_new(self, tender: Tender) -> bool:
        return tender.uid not in self._seen

    def filter_new(self, tenders: list[Tender]) -> list[Tender]:
        return [t for t in tenders if self.is_new(t)]

    def mark(self, tenders: list[Tender]) -> None:
        for t in tenders:
            self._seen.add(t.uid)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"seen": sorted(self._seen)}
        self.path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
