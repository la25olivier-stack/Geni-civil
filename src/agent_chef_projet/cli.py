"""Interface en ligne de commande de l'agent Chargé de projet.

Exemples :
    python -m agent_chef_projet echeancier data/exemple_projet.json
    python -m agent_chef_projet couts       data/exemple_projet.json
    python -m agent_chef_projet alertes      data/exemple_projet.json
    python -m agent_chef_projet analyser     data/exemple_projet.json

Les commandes `echeancier`, `couts` et `alertes` sont déterministes et
fonctionnent sans clé API. La commande `analyser` appelle l'API Claude et
nécessite la variable d'environnement ANTHROPIC_API_KEY.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date

from .agent import AgentChefProjet
from .models import Projet


def _charger_projet(chemin: str) -> Projet:
    with open(chemin, encoding="utf-8") as f:
        return Projet.from_dict(json.load(f))


def _afficher_echeancier(projet: Projet) -> None:
    ech = AgentChefProjet(projet).echeancier_dict()
    print(f"Échéancier — {ech['projet']}")
    print(
        f"  Du {ech['date_debut']} au {ech['date_fin']} "
        f"({ech['duree_totale_jours']} jours ouvrés)"
    )
    print(f"  Chemin critique : {', '.join(ech['chemin_critique']) or '—'}\n")
    for l in ech["lignes"]:
        marque = "★" if l["critique"] else " "
        print(
            f"  {marque} [{l['identifiant']:<6}] {l['nom']:<32} "
            f"{l['date_debut']} → {l['date_fin']} "
            f"({l['duree_jours']} j)"
        )


def _afficher_couts(projet: Projet) -> None:
    s = AgentChefProjet(projet).couts_dict()
    dev = s["devise"]
    print(f"Suivi des coûts — {s['projet']}")
    print(f"  Budget prévu       : {s['budget_total']:>14,.0f} {dev}")
    print(f"  Coût réel engagé   : {s['cout_reel_total']:>14,.0f} {dev}")
    print(f"  Projection à terme : {s['projection_totale']:>14,.0f} {dev}")
    signe = "+" if s["ecart_total"] >= 0 else ""
    print(
        f"  Écart projeté      : {signe}{s['ecart_total']:>13,.0f} {dev} "
        f"({signe}{s['ecart_total_pct']:.1f} %)\n"
    )
    print("  Par catégorie :")
    for cat, v in s["par_categorie"].items():
        print(
            f"    - {cat:<20} prévu {v['budget_prevu']:>12,.0f} "
            f"| projeté {v['projection']:>12,.0f} {dev}"
        )


def _afficher_alertes(projet: Projet, date_analyse: date | None) -> None:
    alertes = AgentChefProjet(projet).alertes_list(date_analyse)
    if not alertes:
        print("Aucune alerte : le projet est dans les clous. ✓")
        return
    print(f"{len(alertes)} alerte(s) détectée(s) :\n")
    icones = {"critique": "🔴", "attention": "🟠", "info": "🔵"}
    for a in alertes:
        print(f"  {icones.get(a['priorite'], '•')} [{a['type']}] {a['message']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="agent_chef_projet",
        description="Agent IA de gestion de projet en génie civil.",
    )
    sous = parser.add_subparsers(dest="commande", required=True)

    for nom in ("echeancier", "couts", "alertes", "analyser"):
        p = sous.add_parser(nom)
        p.add_argument("projet", help="Chemin vers le fichier JSON du projet.")
        if nom in ("alertes", "analyser"):
            p.add_argument(
                "--date",
                help="Date d'analyse (AAAA-MM-JJ). Défaut : aujourd'hui.",
                default=None,
            )
        if nom == "analyser":
            p.add_argument(
                "--demande",
                help="Consigne libre adressée à l'agent.",
                default=None,
            )

    args = parser.parse_args(argv)
    projet = _charger_projet(args.projet)
    date_analyse = (
        date.fromisoformat(args.date)
        if getattr(args, "date", None)
        else date.today()
    )

    if args.commande == "echeancier":
        _afficher_echeancier(projet)
    elif args.commande == "couts":
        _afficher_couts(projet)
    elif args.commande == "alertes":
        _afficher_alertes(projet, date_analyse)
    elif args.commande == "analyser":
        try:
            texte = AgentChefProjet(projet).analyser(
                demande=args.demande, date_analyse=date_analyse
            )
        except RuntimeError as exc:
            print(f"Erreur : {exc}", file=sys.stderr)
            return 1
        except Exception as exc:  # erreurs d'API (clé manquante, réseau…)
            print(
                "Erreur lors de l'appel à l'API Claude : "
                f"{type(exc).__name__} — {exc}\n"
                "Vérifiez que ANTHROPIC_API_KEY est définie.",
                file=sys.stderr,
            )
            return 1
        print(texte)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
