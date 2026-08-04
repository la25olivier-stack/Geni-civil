"""Source RSS/Atom générique.

Sert de socle aux plateformes qui exposent un flux (MERX, Constructo, BSDQ,
portails municipaux, etc.). Le parseur gère RSS 2.0 et Atom sans dépendance
externe afin de rester testable hors ligne.

Options utiles :
  - ``category`` : étiquette de catégorie appliquée à tous les avis du flux.
  - ``organization`` : donneur d'ordre par défaut si absent du flux.
  - ``closing_regex`` : expression régulière (avec le groupe ``date``) pour
    extraire la date limite du résumé quand elle n'a pas de champ dédié.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Iterable, Optional
from xml.etree import ElementTree as ET

from ..models import Tender
from .base import BaseSource
from .seao import parse_date

_HTML_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")

_RSS_DATE_FORMATS = (
    "%a, %d %b %Y %H:%M:%S %z",
    "%a, %d %b %Y %H:%M:%S %Z",
    "%Y-%m-%dT%H:%M:%S%z",
    "%Y-%m-%dT%H:%M:%SZ",
)


def _clean(text: Optional[str]) -> str:
    if not text:
        return ""
    text = _HTML_TAG.sub(" ", text)
    return _WS.sub(" ", text).strip()


def _parse_feed_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    value = value.strip()
    for fmt in _RSS_DATE_FORMATS:
        try:
            dt = datetime.strptime(value, fmt)
            return dt.replace(tzinfo=None)
        except ValueError:
            continue
    return parse_date(value)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _find_text(item: ET.Element, *names: str) -> str:
    wanted = {n.lower() for n in names}
    for child in item:
        if _local(child.tag) in wanted:
            return (child.text or "").strip()
    return ""


def _find_link(item: ET.Element) -> str:
    # RSS : <link>texte</link> ; Atom : <link href="..."/>.
    for child in item:
        if _local(child.tag) != "link":
            continue
        href = child.get("href")
        if href:
            return href.strip()
        if child.text and child.text.strip():
            return child.text.strip()
    return ""


class RssSource(BaseSource):
    type_name = "rss"

    def parse(self, payload: str) -> Iterable[Tender]:
        root = ET.fromstring(payload.strip())
        items = [el for el in root.iter() if _local(el.tag) in ("item", "entry")]

        default_category = self.options.get("category", "")
        default_org = self.options.get("organization", "")
        closing_regex = self.options.get("closing_regex")
        closing_re = re.compile(closing_regex) if closing_regex else None

        for item in items:
            title = _clean(_find_text(item, "title"))
            summary = _clean(
                _find_text(item, "description", "summary", "content")
            )
            if not title and not summary:
                continue

            published = _parse_feed_date(
                _find_text(item, "pubdate", "published", "updated", "date")
            )
            closing = None
            if closing_re and summary:
                m = closing_re.search(summary)
                if m:
                    closing = parse_date(m.groupdict().get("date") or m.group(0))

            yield Tender(
                source=self.name,
                title=title or summary[:120],
                url=_find_link(item),
                reference=_clean(_find_text(item, "guid", "id")),
                organization=default_org,
                category=default_category,
                description=summary,
                published_at=published,
                closing_at=closing,
                raw={"title": title, "summary": summary},
            )
