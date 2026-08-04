"""Détection des dépassements de coûts et de délais.

Deux familles d'alertes :

* **Coûts** — la projection à terminaison d'une tâche (ou du projet) dépasse
  son budget au-delà de la marge de tolérance `seuil_alerte_pct`.
* **Délais** — l'avancement réel d'une tâche est en retard par rapport à
  l'avancement attendu à la date d'analyse, compte tenu de son échéancier.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .couts import calculer_couts
from .echeancier import generer_echeancier, _iter_jours_ouvres
from .models import Priorite, Projet


@dataclass
class Alerte:
    type: str  # "cout" | "delai"
    priorite: Priorite
    tache: str  # identifiant de tâche, ou "PROJET" pour une alerte globale
    message: str
    ecart: float = 0.0

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "priorite": self.priorite.value,
            "tache": self.tache,
            "message": self.message,
            "ecart": round(self.ecart, 2),
        }


def _priorite_selon_ecart(ecart_pct: float, seuil: float) -> Priorite:
    if ecart_pct >= seuil * 3:
        return Priorite.CRITIQUE
    if ecart_pct >= seuil:
        return Priorite.ATTENTION
    return Priorite.INFO


def detecter_alertes(projet: Projet, date_analyse: date | None = None) -> list[Alerte]:
    """Retourne la liste des alertes actives à la date d'analyse.

    `date_analyse` par défaut = date de début du projet (utile pour les tests
    déterministes). En production, passez `date.today()`.
    """
    if date_analyse is None:
        date_analyse = projet.date_debut

    alertes: list[Alerte] = []
    seuil = projet.seuil_alerte_pct

    # -- Alertes de coûts ------------------------------------------------ #
    synthese = calculer_couts(projet)
    for ligne in synthese.lignes:
        if ligne.ecart_pct > seuil:
            alertes.append(
                Alerte(
                    type="cout",
                    priorite=_priorite_selon_ecart(ligne.ecart_pct, seuil),
                    tache=ligne.identifiant,
                    message=(
                        f"Dépassement de budget prévu sur « {ligne.nom} » : "
                        f"projection {ligne.projection_terminaison:,.0f} {projet.devise} "
                        f"contre {ligne.budget_prevu:,.0f} {projet.devise} "
                        f"(+{ligne.ecart_pct:.1f} %)."
                    ),
                    ecart=ligne.ecart,
                )
            )

    if synthese.ecart_total_pct > seuil:
        alertes.append(
            Alerte(
                type="cout",
                priorite=_priorite_selon_ecart(synthese.ecart_total_pct, seuil),
                tache="PROJET",
                message=(
                    f"Dépassement global projeté : "
                    f"{synthese.projection_totale:,.0f} {projet.devise} "
                    f"contre un budget de {synthese.budget_total:,.0f} {projet.devise} "
                    f"(+{synthese.ecart_total_pct:.1f} %)."
                ),
                ecart=synthese.ecart_total,
            )
        )

    # -- Alertes de délais ---------------------------------------------- #
    echeancier = generer_echeancier(projet)
    lignes_par_id = {l.identifiant: l for l in echeancier.lignes}
    for t in projet.taches:
        ligne = lignes_par_id.get(t.identifiant)
        if ligne is None or t.duree_jours == 0:
            continue

        attendu = _avancement_attendu_pct(
            ligne.date_debut, ligne.date_fin, date_analyse
        )
        retard = attendu - t.avancement_pct
        # On alerte si le retard dépasse la marge de tolérance (en points de %).
        if retard > seuil:
            priorite = (
                Priorite.CRITIQUE
                if ligne.critique
                else _priorite_selon_ecart(retard, seuil)
            )
            mention_critique = " (chemin critique)" if ligne.critique else ""
            alertes.append(
                Alerte(
                    type="delai",
                    priorite=priorite,
                    tache=t.identifiant,
                    message=(
                        f"Retard sur « {t.nom} »{mention_critique} : "
                        f"avancement {t.avancement_pct:.0f} % "
                        f"contre {attendu:.0f} % attendus au {date_analyse.isoformat()}."
                    ),
                    ecart=retard,
                )
            )

    # Tri : les plus critiques d'abord.
    ordre_priorite = {Priorite.CRITIQUE: 0, Priorite.ATTENTION: 1, Priorite.INFO: 2}
    alertes.sort(key=lambda a: (ordre_priorite[a.priorite], -abs(a.ecart)))
    return alertes


def _avancement_attendu_pct(debut: date, fin: date, aujourd_hui: date) -> float:
    """Pourcentage d'avancement théorique d'une tâche à une date donnée."""
    if aujourd_hui <= debut:
        return 0.0
    if aujourd_hui >= fin:
        return 100.0
    total = sum(1 for _ in _iter_jours_ouvres(debut, fin))
    ecoules = sum(1 for _ in _iter_jours_ouvres(debut, aujourd_hui))
    if total == 0:
        return 100.0
    return min(100.0, ecoules / total * 100.0)
