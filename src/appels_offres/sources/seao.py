"""Source SEAO — Système électronique d'appel d'offres du Québec.

SEAO publie ses avis en données ouvertes (donneesquebec.ca, jeu de données
« seao ») sous forme de fichiers XML. Le format exact des balises a évolué au
fil du temps ; ce parseur est donc *tolérant* : pour chaque champ il essaie
plusieurs noms de balises candidats (insensible à la casse) et ceux-ci peuvent
être surchargés via la configuration (`options.fields`).

Il gère aussi le flux Atom/RSS de recherche de seao.ca lorsque `options.format`
vaut « feed » (délégué à la source RSS générique).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Iterable, Optional
from xml.etree import ElementTree as ET

from ..models import Tender
from .base import BaseSource

logger = logging.getLogger(__name__)

# Balises candidates par champ (minuscules, sans espace de noms).
_DEFAULT_FIELDS: dict[str, list[str]] = {
    "record": ["avis", "avispublic", "release", "contrat"],
    "reference": ["numeroseao", "numero", "numeroreference", "reference", "id"],
    "title": ["titre", "titreavis", "objet", "description"],
    "organization": ["organisme", "nomorganisme", "donneurordre", "acheteur"],
    "category": ["nature", "categorie", "typeavis", "typecontrat"],
    "location": ["region", "lieu", "municipalite", "territoire"],
    "url": ["url", "lien", "hyperlien", "adresse"],
    "published_at": ["datepublication", "datepubl", "datediffusion", "date"],
    "closing_at": ["datefermeture", "datelimite", "dateheurefermeture", "echeance"],
    "value": ["montant", "valeur", "valeurestimee", "estimation"],
    "description": ["description", "sommaire", "objet"],
}

_DATE_FORMATS = (
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
)


def _local(tag: str) -> str:
    """Nom de balise sans espace de noms, en minuscules."""
    return tag.rsplit("}", 1)[-1].lower()


def parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = value.strip()
    # Tronque un éventuel fuseau horaire (+00:00 / Z) pour simplifier.
    text = re.sub(r"(Z|[+-]\d{2}:?\d{2})$", "", text).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    logger.debug("SEAO: date non reconnue: %r", value)
    return None


class SeaoSource(BaseSource):
    type_name = "seao_opendata"

    def _fields(self) -> dict[str, list[str]]:
        fields = {k: list(v) for k, v in _DEFAULT_FIELDS.items()}
        for key, extra in (self.options.get("fields") or {}).items():
            if isinstance(extra, str):
                extra = [extra]
            # Les surcharges ont priorité tout en gardant les défauts en secours.
            fields[key] = [e.lower() for e in extra] + fields.get(key, [])
        return fields

    def parse(self, payload: str) -> Iterable[Tender]:
        root = ET.fromstring(payload.strip())
        fields = self._fields()
        record_tags = set(fields["record"])

        # Collecte tous les éléments dont le nom local correspond à un
        # enregistrement d'avis, où qu'ils se trouvent dans l'arbre.
        records = [el for el in root.iter() if _local(el.tag) in record_tags]
        if not root.tag or _local(root.tag) in record_tags:
            records = [root] + [r for r in records if r is not root]

        for rec in records:
            tender = self._parse_record(rec, fields)
            if tender is not None:
                yield tender

    def _parse_record(self, rec: ET.Element, fields: dict) -> Optional[Tender]:
        # Indexe les enfants directs (et petits-enfants) par nom local.
        values: dict[str, str] = {}
        for child in rec.iter():
            if child is rec:
                continue
            name = _local(child.tag)
            text = (child.text or "").strip()
            if text and name not in values:
                values[name] = text

        def pick(field_key: str) -> str:
            for candidate in fields[field_key]:
                if candidate in values:
                    return values[candidate]
            return ""

        title = pick("title")
        reference = pick("reference")
        if not title and not reference:
            return None

        return Tender(
            source=self.name or "SEAO",
            title=title or f"Avis {reference}",
            url=pick("url"),
            reference=reference,
            organization=pick("organization"),
            category=pick("category"),
            description=pick("description"),
            location=pick("location"),
            published_at=parse_date(pick("published_at")),
            closing_at=parse_date(pick("closing_at")),
            estimated_value=pick("value"),
            raw=values,
        )
