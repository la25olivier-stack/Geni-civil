"""Chargement et validation de la configuration de l'agent."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

_ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)(?::-(.*?))?\}")


def _expand_env(value: Any) -> Any:
    """Remplace les motifs ${VAR} ou ${VAR:-defaut} par les variables d'env."""
    if isinstance(value, str):
        def repl(match: re.Match) -> str:
            var, default = match.group(1), match.group(2)
            return os.environ.get(var, default if default is not None else "")
        return _ENV_PATTERN.sub(repl, value)
    if isinstance(value, dict):
        return {k: _expand_env(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand_env(v) for v in value]
    return value


@dataclass
class SourceConfig:
    name: str
    type: str
    enabled: bool = True
    url: str = ""
    options: dict = field(default_factory=dict)


@dataclass
class RelevanceConfig:
    min_score: float = 2.0
    keywords: list[str] = field(default_factory=list)
    strong_keywords: list[str] = field(default_factory=list)
    exclude_keywords: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)


@dataclass
class EmailConfig:
    enabled: bool = True
    recipient: str = ""
    from_address: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    username: str = ""
    password: str = ""
    subject_prefix: str = "[Veille appels d'offres]"


@dataclass
class Config:
    lookback_days: int = 7
    state_file: str = "data/seen.json"
    output_dir: str = "data/digests"
    relevance: RelevanceConfig = field(default_factory=RelevanceConfig)
    sources: list[SourceConfig] = field(default_factory=list)
    email: EmailConfig = field(default_factory=EmailConfig)

    @classmethod
    def load(cls, path: str | Path) -> "Config":
        path = Path(path)
        with path.open("r", encoding="utf-8") as fh:
            data = _expand_env(yaml.safe_load(fh) or {})

        rel = RelevanceConfig(**{
            k: v for k, v in (data.get("relevance") or {}).items()
            if k in RelevanceConfig.__dataclass_fields__
        })
        email = EmailConfig(**{
            k: v for k, v in (data.get("email") or {}).items()
            if k in EmailConfig.__dataclass_fields__
        })
        sources = []
        for raw in data.get("sources") or []:
            sources.append(SourceConfig(
                name=raw["name"],
                type=raw["type"],
                enabled=raw.get("enabled", True),
                url=raw.get("url", ""),
                options=raw.get("options", {}) or {},
            ))

        return cls(
            lookback_days=int(data.get("lookback_days", 7)),
            state_file=data.get("state_file", "data/seen.json"),
            output_dir=data.get("output_dir", "data/digests"),
            relevance=rel,
            sources=sources,
            email=email,
        )
