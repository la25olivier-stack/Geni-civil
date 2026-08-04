"""Interface en ligne de commande de l'Agent SST.

Exemples :

    python -m agent_sst.cli analyse -f operation.txt -o analyse.md
    python -m agent_sst.cli inspection -t "Échafaudage sans garde-corps..."
    python -m agent_sst.cli rapport -f analyse.md
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from agent_sst.agent import AgentSST
from agent_sst import rendu


def _lire_entree(texte: str | None, fichier: str | None) -> str:
    if fichier:
        return Path(fichier).read_text(encoding="utf-8")
    if texte:
        return texte
    if not sys.stdin.isatty():
        return sys.stdin.read()
    raise SystemExit(
        "Erreur : fournissez le contenu via --texte, --fichier ou stdin."
    )


def _ecrire_sortie(contenu: str, sortie: str | None) -> None:
    if sortie:
        Path(sortie).write_text(contenu, encoding="utf-8")
        print(f"Écrit dans {sortie}", file=sys.stderr)
    else:
        print(contenu)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="agent_sst",
        description="Agent SST — analyses de risques, inspections, rapports "
        "pour le génie civil.",
    )
    parser.add_argument(
        "--modele", default="claude-opus-5", help="Modèle Claude à utiliser"
    )
    sous = parser.add_subparsers(dest="commande", required=True)

    for nom, aide in (
        ("analyse", "Analyse de risques d'une opération"),
        ("inspection", "Rapport d'inspection à partir d'observations"),
        ("rapport", "Rapport SST de synthèse"),
    ):
        p = sous.add_parser(nom, help=aide)
        p.add_argument("-t", "--texte", help="Contenu en clair")
        p.add_argument("-f", "--fichier", help="Fichier d'entrée")
        p.add_argument("-o", "--sortie", help="Fichier de sortie (.md)")

    args = parser.parse_args(argv)
    entree = _lire_entree(args.texte, args.fichier)
    agent = AgentSST(modele=args.modele)

    if args.commande == "analyse":
        resultat = rendu.analyse_en_markdown(agent.analyser_risques(entree))
    elif args.commande == "inspection":
        resultat = rendu.inspection_en_markdown(agent.inspecter(entree))
    else:  # rapport
        resultat = rendu.rapport_en_markdown(agent.rediger_rapport(entree))

    _ecrire_sortie(resultat, args.sortie)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
