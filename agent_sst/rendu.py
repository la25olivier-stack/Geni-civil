"""Mise en forme Markdown des livrables SST."""

from __future__ import annotations

from agent_sst.schemas import AnalyseRisques, RapportInspection, RapportSST

_LIBELLE_NIVEAU = {
    "acceptable": "🟢 Acceptable",
    "modere": "🟡 Modéré",
    "important": "🟠 Important",
    "critique": "🔴 Critique",
}


def analyse_en_markdown(a: AnalyseRisques) -> str:
    """Rend une analyse de risques en Markdown."""
    lignes = [
        f"# {a.titre}",
        "",
        f"- **Chantier :** {a.chantier}",
        f"- **Rédacteur :** {a.redacteur}",
        f"- **Date :** {a.date}",
        f"- **Périmètre :** {a.perimetre}",
        "",
        "## Analyse des risques",
        "",
        "| Phase | Danger | Situation | Dommage | G | P | Niveau | "
        "Mesures de prévention | Responsable | Délai |",
        "|---|---|---|---|:-:|:-:|---|---|---|---|",
    ]
    for r in a.lignes:
        mesures = "<br>".join(f"- {m}" for m in r.mesures_prevention)
        niveau = _LIBELLE_NIVEAU.get(r.niveau_risque, r.niveau_risque)
        lignes.append(
            f"| {r.phase} | {r.danger} | {r.situation_dangereuse} | "
            f"{r.dommage_potentiel} | {r.gravite} | {r.probabilite} | "
            f"{niveau} | {mesures} | {r.responsable} | {r.delai} |"
        )
    lignes += ["", "## Synthèse", "", a.synthese, ""]
    return "\n".join(lignes)


def inspection_en_markdown(r: RapportInspection) -> str:
    """Rend un rapport d'inspection en Markdown."""
    lignes = [
        f"# {r.titre}",
        "",
        f"- **Chantier :** {r.chantier}",
        f"- **Inspecteur :** {r.inspecteur}",
        f"- **Date :** {r.date}",
        f"- **Taux de conformité :** {r.taux_conformite} %",
        "",
        "## Points de contrôle",
        "",
        "| Catégorie | Point contrôlé | Conforme | Constat | G | "
        "Action corrective | Délai |",
        "|---|---|:-:|---|:-:|---|---|",
    ]
    for p in r.points:
        conforme = "✅" if p.conforme else "❌"
        lignes.append(
            f"| {p.categorie} | {p.point_controle} | {conforme} | "
            f"{p.constat} | {p.gravite} | {p.action_corrective} | {p.delai} |"
        )
    lignes += ["", "## Synthèse", "", r.synthese, ""]
    return "\n".join(lignes)


def rapport_en_markdown(r: RapportSST) -> str:
    """Rend un rapport de synthèse (le contenu est déjà en Markdown)."""
    entete = (
        f"<!-- {r.titre} — {r.chantier} — {r.date} -->\n\n"
    )
    return entete + r.contenu_markdown
