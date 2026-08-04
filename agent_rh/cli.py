"""Interface en ligne de commande de l'Agent RH.

Exemples :

    python -m agent_rh.cli employe ajouter --matricule GC001 --nom Martin --prenom Léa
    python -m agent_rh.cli echeances --jours 30
    python -m agent_rh.cli alertes
    python -m agent_rh.cli rapport
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Optional

from .agent import AgentRH, EmployeIntrouvable
from .models import Echeance, StatutEcheance, TypeDocument

DB_DEFAUT = "data/geni_civil_rh.db"

# Symboles pour un rendu lisible en console.
_ICONE = {
    StatutEcheance.EXPIRE: "❌",
    StatutEcheance.CRITIQUE: "🔴",
    StatutEcheance.URGENT: "🟠",
    StatutEcheance.A_VENIR: "🟡",
    StatutEcheance.OK: "🟢",
    StatutEcheance.SANS_ECHEANCE: "⚪",
}


def _fmt_echeance(e: Echeance) -> str:
    icone = _ICONE.get(e.statut, "•")
    if e.jours_restants is None:
        delai = "sans échéance"
    elif e.jours_restants < 0:
        delai = f"expiré depuis {abs(e.jours_restants)} j"
    else:
        delai = f"dans {e.jours_restants} j"
    oblig = " [obligatoire]" if e.obligatoire else ""
    return (f"{icone} {e.statut.value.upper():9} {e.matricule:8} {e.employe:22} "
            f"{e.categorie:10} {e.libelle}{oblig} — "
            f"{e.date_expiration} ({delai})")


def _agent(args: argparse.Namespace) -> AgentRH:
    return AgentRH(args.db)


# --------------------------------------------------------------------- handlers
def cmd_employe_ajouter(agent: AgentRH, a: argparse.Namespace) -> int:
    emp = agent.ajouter_employe(
        matricule=a.matricule, nom=a.nom, prenom=a.prenom,
        poste=a.poste or "", date_embauche=a.embauche, email=a.email or "",
    )
    print(f"Salarié ajouté : {emp.matricule} — {emp.nom_complet} (id {emp.id})")
    return 0


def cmd_employe_lister(agent: AgentRH, a: argparse.Namespace) -> int:
    employes = agent.lister_employes(actifs_seulement=a.actifs)
    if not employes:
        print("Aucun salarié enregistré.")
        return 0
    for e in employes:
        etat = "" if e.actif else " (inactif)"
        print(f"{e.matricule:8} {e.nom_complet:24} {e.poste}{etat}")
    return 0


def cmd_formation_ajouter(agent: AgentRH, a: argparse.Namespace) -> int:
    f = agent.ajouter_formation(
        matricule=a.matricule, intitule=a.intitule, organisme=a.organisme or "",
        date_obtention=a.obtention, date_expiration=a.expiration,
        obligatoire=a.obligatoire,
    )
    print(f"Formation ajoutée : {f.intitule} (id {f.id}) pour {a.matricule}")
    return 0


def cmd_permis_ajouter(agent: AgentRH, a: argparse.Namespace) -> int:
    p = agent.ajouter_permis(
        matricule=a.matricule, type=a.type, numero=a.numero or "",
        date_obtention=a.obtention, date_expiration=a.expiration,
    )
    print(f"Permis ajouté : {p.type} (id {p.id}) pour {a.matricule}")
    return 0


def cmd_document_ajouter(agent: AgentRH, a: argparse.Namespace) -> int:
    d = agent.ajouter_document(
        matricule=a.matricule, type=a.type, nom_fichier=a.fichier,
        chemin=a.chemin or "", date_expiration=a.expiration,
    )
    print(f"Document ajouté : {d.type.value} — {d.nom_fichier} (id {d.id}) pour {a.matricule}")
    return 0


def cmd_echeances(agent: AgentRH, a: argparse.Namespace) -> int:
    echeances = agent.echeances(
        dans_jours=a.jours, inclure_expires=not a.sans_expires, matricule=a.matricule,
    )
    if a.json:
        print(json.dumps([_echeance_dict(e) for e in echeances], ensure_ascii=False, indent=2))
        return 0
    if not echeances:
        print("Aucune échéance sur la période demandée.")
        return 0
    for e in echeances:
        print(_fmt_echeance(e))
    print(f"\n{len(echeances)} échéance(s).")
    return 0


def cmd_alertes(agent: AgentRH, a: argparse.Namespace) -> int:
    alertes = agent.alertes(matricule=a.matricule)
    if a.json:
        print(json.dumps([_echeance_dict(e) for e in alertes], ensure_ascii=False, indent=2))
        return 0
    if not alertes:
        print("✅ Aucune alerte : tout est à jour.")
        return 0
    print(f"⚠️  {len(alertes)} alerte(s) nécessitant une action :\n")
    for e in alertes:
        print(_fmt_echeance(e))
    return 1  # code de sortie non nul : utile en supervision/CI


def cmd_rapport(agent: AgentRH, a: argparse.Namespace) -> int:
    rapport = agent.rapport()
    if a.json:
        print(json.dumps(rapport, ensure_ascii=False, indent=2))
        return 0
    print("=== Rapport RH — Geni-civil ===")
    print(f"Date              : {rapport['date_rapport']}")
    print(f"Salariés          : {rapport['employes_actifs']} actifs "
          f"/ {rapport['employes_total']} au total")
    print(f"Formations        : {rapport['formations_total']}")
    print(f"Permis            : {rapport['permis_total']}")
    print(f"Documents         : {rapport['documents_total']}")
    print("Échéances par statut :")
    for statut, n in rapport["echeances_par_statut"].items():
        if n:
            print(f"  - {statut:14} : {n}")
    print(f"Alertes           : {rapport['alertes_total']} "
          f"(dont {rapport['obligatoires_en_alerte']} obligatoire(s))")
    return 0


def _echeance_dict(e: Echeance) -> dict:
    return {
        "matricule": e.matricule,
        "employe": e.employe,
        "categorie": e.categorie,
        "libelle": e.libelle,
        "date_expiration": e.date_expiration.isoformat() if e.date_expiration else None,
        "jours_restants": e.jours_restants,
        "statut": e.statut.value,
        "obligatoire": e.obligatoire,
    }


# ----------------------------------------------------------------------- parser
def construire_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="agent_rh",
        description="Agent RH — formations, permis, échéances et documents des employés.",
    )
    p.add_argument("--db", default=DB_DEFAUT, help=f"Fichier SQLite (défaut : {DB_DEFAUT})")
    sub = p.add_subparsers(dest="commande", required=True)

    # employe
    emp = sub.add_parser("employe", help="Gestion des salariés").add_subparsers(
        dest="action", required=True)
    e_add = emp.add_parser("ajouter", help="Ajouter un salarié")
    e_add.add_argument("--matricule", required=True)
    e_add.add_argument("--nom", required=True)
    e_add.add_argument("--prenom", required=True)
    e_add.add_argument("--poste")
    e_add.add_argument("--embauche", help="Date d'embauche AAAA-MM-JJ")
    e_add.add_argument("--email")
    e_add.set_defaults(func=cmd_employe_ajouter)
    e_list = emp.add_parser("lister", help="Lister les salariés")
    e_list.add_argument("--actifs", action="store_true", help="Uniquement les actifs")
    e_list.set_defaults(func=cmd_employe_lister)

    # formation
    fo = sub.add_parser("formation", help="Gestion des formations").add_subparsers(
        dest="action", required=True)
    f_add = fo.add_parser("ajouter", help="Ajouter une formation")
    f_add.add_argument("--matricule", required=True)
    f_add.add_argument("--intitule", required=True)
    f_add.add_argument("--organisme")
    f_add.add_argument("--obtention", help="Date d'obtention AAAA-MM-JJ")
    f_add.add_argument("--expiration", help="Date d'expiration AAAA-MM-JJ")
    f_add.add_argument("--obligatoire", action="store_true")
    f_add.set_defaults(func=cmd_formation_ajouter)

    # permis
    pe = sub.add_parser("permis", help="Gestion des permis").add_subparsers(
        dest="action", required=True)
    p_add = pe.add_parser("ajouter", help="Ajouter un permis")
    p_add.add_argument("--matricule", required=True)
    p_add.add_argument("--type", required=True, help='Ex. "Permis C", "CACES R482 B1"')
    p_add.add_argument("--numero")
    p_add.add_argument("--obtention", help="Date d'obtention AAAA-MM-JJ")
    p_add.add_argument("--expiration", help="Date d'expiration AAAA-MM-JJ")
    p_add.set_defaults(func=cmd_permis_ajouter)

    # document
    do = sub.add_parser("document", help="Gestion des documents").add_subparsers(
        dest="action", required=True)
    d_add = do.add_parser("ajouter", help="Ajouter un document")
    d_add.add_argument("--matricule", required=True)
    d_add.add_argument("--type", required=True,
                       choices=[t.value for t in TypeDocument], help="Type de document")
    d_add.add_argument("--fichier", required=True, help="Nom du fichier")
    d_add.add_argument("--chemin", help="Chemin/URL de stockage")
    d_add.add_argument("--expiration", help="Date d'expiration AAAA-MM-JJ")
    d_add.set_defaults(func=cmd_document_ajouter)

    # echeances
    ec = sub.add_parser("echeances", help="Lister les échéances")
    ec.add_argument("--jours", type=int, help="Horizon en jours (défaut : toutes)")
    ec.add_argument("--matricule", help="Restreindre à un salarié")
    ec.add_argument("--sans-expires", action="store_true",
                    help="Exclure les éléments déjà expirés")
    ec.add_argument("--json", action="store_true", help="Sortie JSON")
    ec.set_defaults(func=cmd_echeances)

    # alertes
    al = sub.add_parser("alertes", help="Échéances nécessitant une action")
    al.add_argument("--matricule", help="Restreindre à un salarié")
    al.add_argument("--json", action="store_true", help="Sortie JSON")
    al.set_defaults(func=cmd_alertes)

    # rapport
    ra = sub.add_parser("rapport", help="Synthèse RH")
    ra.add_argument("--json", action="store_true", help="Sortie JSON")
    ra.set_defaults(func=cmd_rapport)

    return p


def main(argv: Optional[list[str]] = None) -> int:
    parser = construire_parser()
    args = parser.parse_args(argv)
    agent = _agent(args)
    try:
        return args.func(agent, args)
    except EmployeIntrouvable as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        return 2
    except (ValueError, KeyError) as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        return 2
    finally:
        agent.close()


if __name__ == "__main__":
    raise SystemExit(main())
