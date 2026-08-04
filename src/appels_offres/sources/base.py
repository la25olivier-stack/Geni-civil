"""Interface commune des sources d'appels d'offres."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import unquote, urlparse

from ..models import Tender

logger = logging.getLogger(__name__)

try:  # requests est optionnel : les parseurs restent utilisables hors ligne.
    import requests
except Exception:  # pragma: no cover - dépend de l'environnement
    requests = None  # type: ignore

USER_AGENT = (
    "GeniCivil-VeilleAppelsOffres/0.1 "
    "(+https://github.com/la25olivier-stack/geni-civil)"
)


class BaseSource(ABC):
    """Un adaptateur de plateforme.

    Le contrat sépare volontairement la récupération réseau (`fetch_raw`) de
    l'analyse (`parse`) afin que `parse` soit testable hors ligne avec des
    fixtures.
    """

    #: identifiant de type utilisé dans la configuration
    type_name: str = "base"

    def __init__(self, name: str, url: str = "", options: Optional[dict] = None):
        self.name = name
        self.url = url
        self.options = options or {}

    # ------------------------------------------------------------------ #
    def fetch_raw(self, timeout: int = 30) -> str:
        """Récupère le contenu brut (XML/HTML/RSS) depuis `self.url`.

        Gère les URLs http(s), les URLs `file://` et les chemins locaux (pratique
        pour rejouer un fichier de données ouvertes téléchargé, ou pour tester).
        """
        if not self.url:
            raise ValueError(f"Source {self.name}: aucune URL configurée.")

        local = self._local_path()
        if local is not None:
            return local.read_text(encoding="utf-8")

        if requests is None:
            raise RuntimeError(
                "Le module 'requests' est requis pour la récupération réseau."
            )
        resp = requests.get(
            self.url,
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )
        resp.raise_for_status()
        resp.encoding = resp.encoding or "utf-8"
        return resp.text

    def _local_path(self) -> Optional[Path]:
        """Renvoie un chemin local si `self.url` désigne un fichier, sinon None."""
        parsed = urlparse(self.url)
        if parsed.scheme == "file":
            return Path(unquote(parsed.path))
        if parsed.scheme in ("http", "https"):
            return None
        # Pas de schéma réseau : traité comme un chemin de système de fichiers.
        candidate = Path(self.url)
        return candidate if candidate.exists() else None

    @abstractmethod
    def parse(self, payload: str) -> Iterable[Tender]:
        """Transforme le contenu brut en objets `Tender`."""
        raise NotImplementedError

    # ------------------------------------------------------------------ #
    def collect(self, timeout: int = 30) -> list[Tender]:
        """Récupère puis analyse ; ne lève jamais : journalise et renvoie []."""
        try:
            payload = self.fetch_raw(timeout=timeout)
        except Exception as exc:  # noqa: BLE001 - une source défaillante ne doit pas tout arrêter
            logger.warning("Source %s: échec de récupération (%s)", self.name, exc)
            return []
        try:
            tenders = list(self.parse(payload))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Source %s: échec d'analyse (%s)", self.name, exc)
            return []
        for tender in tenders:
            if not tender.source:
                tender.source = self.name
        logger.info("Source %s: %d avis récupérés", self.name, len(tenders))
        return tenders
