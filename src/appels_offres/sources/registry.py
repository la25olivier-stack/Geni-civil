"""Fabrique de sources à partir de la configuration."""

from __future__ import annotations

from ..config import SourceConfig
from .base import BaseSource
from .rss import RssSource
from .seao import SeaoSource

# Enregistrement des types de source disponibles.
SOURCE_TYPES: dict[str, type[BaseSource]] = {
    SeaoSource.type_name: SeaoSource,   # "seao_opendata"
    RssSource.type_name: RssSource,     # "rss"  (MERX, Constructo, etc.)
}


def build_source(cfg: SourceConfig) -> BaseSource:
    """Instancie la source correspondant au type déclaré en configuration."""
    try:
        cls = SOURCE_TYPES[cfg.type]
    except KeyError as exc:
        known = ", ".join(sorted(SOURCE_TYPES))
        raise ValueError(
            f"Type de source inconnu '{cfg.type}' (connus : {known})."
        ) from exc
    return cls(name=cfg.name, url=cfg.url, options=cfg.options)
