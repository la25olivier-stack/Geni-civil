"""Construction du digest (Markdown, HTML, texte) à partir des avis retenus."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from .models import Tender
from .summarize import summarize


def _deadline_stamp(t: Tender) -> str:
    return t.closing_at.strftime("%Y-%m-%d") if t.closing_at else "—"


def build_markdown(tenders: list[Tender], now: Optional[datetime] = None) -> str:
    now = now or datetime.now()
    lines: list[str] = []
    lines.append(f"# Veille appels d'offres — {now.strftime('%Y-%m-%d')}")
    lines.append("")
    if not tenders:
        lines.append("_Aucun nouvel appel d'offres pertinent pour cette période._")
        return "\n".join(lines) + "\n"

    lines.append(f"**{len(tenders)} appel(s) d'offres pertinent(s).**")
    lines.append("")

    # Table de synthèse.
    lines.append("| # | Source | Titre | Organisme | Échéance | Score |")
    lines.append("|---|--------|-------|-----------|----------|-------|")
    for i, t in enumerate(tenders, 1):
        title = t.title.replace("|", "\\|")
        org = (t.organization or "—").replace("|", "\\|")
        lines.append(
            f"| {i} | {t.source} | {title} | {org} | "
            f"{_deadline_stamp(t)} | {t.relevance_score:g} |"
        )
    lines.append("")

    # Fiches détaillées.
    for i, t in enumerate(tenders, 1):
        heading = f"## {i}. {t.title}"
        if t.reference:
            heading += f"  \n`{t.reference}`"
        lines.append(heading)
        lines.append("")
        lines.append(summarize(t, now=now))
        lines.append("")
        if t.url:
            lines.append(f"🔗 [Consulter l'avis]({t.url})")
            lines.append("")

    return "\n".join(lines) + "\n"


def build_html(tenders: list[Tender], now: Optional[datetime] = None) -> str:
    now = now or datetime.now()
    from html import escape

    rows = []
    for i, t in enumerate(tenders, 1):
        link = f'<a href="{escape(t.url)}">consulter</a>' if t.url else "—"
        rows.append(
            "<tr>"
            f"<td>{i}</td><td>{escape(t.source)}</td>"
            f"<td><strong>{escape(t.title)}</strong><br>"
            f"<small>{escape(summarize(t, now=now))}</small></td>"
            f"<td>{escape(t.organization or '—')}</td>"
            f"<td>{_deadline_stamp(t)}</td>"
            f"<td>{link}</td>"
            "</tr>"
        )

    if not tenders:
        body = "<p><em>Aucun nouvel appel d'offres pertinent.</em></p>"
    else:
        body = (
            f"<p><strong>{len(tenders)}</strong> appel(s) d'offres pertinent(s).</p>"
            "<table cellpadding='6' cellspacing='0' border='1' "
            "style='border-collapse:collapse;font-family:sans-serif;font-size:13px'>"
            "<thead><tr style='background:#f0f0f0'>"
            "<th>#</th><th>Source</th><th>Avis</th><th>Organisme</th>"
            "<th>Échéance</th><th>Lien</th></tr></thead>"
            f"<tbody>{''.join(rows)}</tbody></table>"
        )

    return (
        "<div style='font-family:sans-serif'>"
        f"<h2>Veille appels d'offres — {now.strftime('%Y-%m-%d')}</h2>"
        f"{body}</div>"
    )


def build_text(tenders: list[Tender], now: Optional[datetime] = None) -> str:
    """Version texte brut (repli courriel, console)."""
    now = now or datetime.now()
    if not tenders:
        return "Aucun nouvel appel d'offres pertinent pour cette période.\n"
    out = [f"Veille appels d'offres — {now.strftime('%Y-%m-%d')}",
           f"{len(tenders)} appel(s) d'offres pertinent(s).", ""]
    for i, t in enumerate(tenders, 1):
        out.append(f"{i}. [{t.source}] {t.title}")
        if t.reference:
            out.append(f"   Réf. {t.reference}")
        out.append(f"   {summarize(t, now=now)}")
        if t.url:
            out.append(f"   {t.url}")
        out.append("")
    return "\n".join(out)
