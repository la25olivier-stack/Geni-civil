"""Modèles de données partagés entre les sources et le reste de l'agent."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, asdict
from datetime import datetime, date
from typing import Any, Optional


def _to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


@dataclass
class Tender:
    """Un appel d'offres normalisé, indépendant de la plateforme source."""

    source: str                     # ex. "SEAO", "MERX"
    title: str                      # titre de l'avis
    url: str = ""                   # lien vers l'avis
    reference: str = ""             # numéro de référence / numéro SEAO
    organization: str = ""          # donneur d'ordre / organisme public
    category: str = ""              # nature (travaux, services, biens)
    description: str = ""           # texte descriptif
    location: str = ""              # région / lieu des travaux
    published_at: Optional[datetime] = None   # date de publication
    closing_at: Optional[datetime] = None     # date/heure limite de dépôt
    estimated_value: str = ""       # valeur estimée si disponible
    raw: dict = field(default_factory=dict, repr=False)  # données brutes

    # --- champs renseignés par l'étape de filtrage ---
    relevance_score: float = 0.0
    matched_keywords: list[str] = field(default_factory=list)

    @property
    def uid(self) -> str:
        """Identifiant stable et déterministe pour la déduplication."""
        basis = self.reference.strip() or self.url.strip() or self.title.strip()
        digest = hashlib.sha1(f"{self.source}:{basis}".encode("utf-8")).hexdigest()
        return f"{self.source.lower()}-{digest[:16]}"

    def text_blob(self) -> str:
        """Concatène les champs textuels pour l'analyse de pertinence."""
        parts = [
            self.title,
            self.organization,
            self.category,
            self.description,
            self.location,
        ]
        return " \n ".join(p for p in parts if p).lower()

    def to_dict(self) -> dict:
        data = asdict(self)
        data.pop("raw", None)
        data["published_at"] = _to_iso(self.published_at)
        data["closing_at"] = _to_iso(self.closing_at)
        data["uid"] = self.uid
        return data
