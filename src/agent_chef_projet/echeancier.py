"""Calcul de l'échéancier (planning) d'un projet.

Approche : tri topologique des tâches selon leurs dépendances, puis passe
« au plus tôt » pour dater chaque tâche à partir de la date de début du
projet, en ne comptant que les jours ouvrés. Le chemin critique est ensuite
identifié par une passe « au plus tard ».
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from .models import Projet, Tache


def ajouter_jours_ouvres(depart: date, nb_jours: int) -> date:
    """Ajoute `nb_jours` jours ouvrés (hors samedi/dimanche) à `depart`.

    `nb_jours == 0` renvoie la date de départ inchangée.
    """
    if nb_jours < 0:
        raise ValueError("Le nombre de jours ne peut être négatif.")
    courant = depart
    restants = nb_jours
    while restants > 0:
        courant += timedelta(days=1)
        if courant.weekday() < 5:  # 0 = lundi … 4 = vendredi
            restants -= 1
    return courant


def _premier_jour_ouvre(d: date) -> date:
    """Décale une date jusqu'au prochain jour ouvré si besoin."""
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def _tri_topologique(projet: Projet) -> list[Tache]:
    """Ordonne les tâches pour que chaque dépendance précède ses successeurs.

    Lève ValueError si une dépendance est inconnue ou si un cycle existe.
    """
    identifiants = {t.identifiant for t in projet.taches}
    for t in projet.taches:
        for dep in t.dependances:
            if dep not in identifiants:
                raise ValueError(
                    f"Tâche {t.identifiant} : dépendance inconnue « {dep} »."
                )

    restantes = {t.identifiant: set(t.dependances) for t in projet.taches}
    ordre: list[Tache] = []
    while restantes:
        prets = [tid for tid, deps in restantes.items() if not deps]
        if not prets:
            raise ValueError(
                "Cycle de dépendances détecté dans l'échéancier : "
                + ", ".join(sorted(restantes))
            )
        for tid in sorted(prets):
            ordre.append(projet.tache(tid))
            del restantes[tid]
            for deps in restantes.values():
                deps.discard(tid)
    return ordre


@dataclass
class LigneEcheancier:
    """Résultat daté pour une tâche."""

    identifiant: str
    nom: str
    date_debut: date
    date_fin: date
    duree_jours: int
    critique: bool
    responsable: str


@dataclass
class Echeancier:
    """Échéancier complet du projet."""

    projet: str
    date_debut: date
    date_fin: date
    duree_totale_jours: int
    lignes: list[LigneEcheancier]

    @property
    def chemin_critique(self) -> list[str]:
        return [ligne.identifiant for ligne in self.lignes if ligne.critique]

    def to_dict(self) -> dict:
        return {
            "projet": self.projet,
            "date_debut": self.date_debut.isoformat(),
            "date_fin": self.date_fin.isoformat(),
            "duree_totale_jours": self.duree_totale_jours,
            "chemin_critique": self.chemin_critique,
            "lignes": [
                {
                    "identifiant": l.identifiant,
                    "nom": l.nom,
                    "date_debut": l.date_debut.isoformat(),
                    "date_fin": l.date_fin.isoformat(),
                    "duree_jours": l.duree_jours,
                    "critique": l.critique,
                    "responsable": l.responsable,
                }
                for l in self.lignes
            ],
        }


def generer_echeancier(projet: Projet) -> Echeancier:
    """Construit l'échéancier au plus tôt et marque le chemin critique."""
    if not projet.taches:
        début = _premier_jour_ouvre(projet.date_debut)
        return Echeancier(projet.nom, début, début, 0, [])

    ordre = _tri_topologique(projet)
    début_projet = _premier_jour_ouvre(projet.date_debut)

    # Passe avant : date de début/fin au plus tôt.
    debut: dict[str, date] = {}
    fin: dict[str, date] = {}
    for t in ordre:
        if t.dependances:
            debut_tache = max(fin[dep] for dep in t.dependances)
            debut_tache = _premier_jour_ouvre(debut_tache + timedelta(days=1))
        else:
            debut_tache = début_projet
        # Une tâche d'un jour commence et finit le même jour ouvré.
        duree_effective = max(t.duree_jours - 1, 0) if t.duree_jours > 0 else 0
        fin_tache = ajouter_jours_ouvres(debut_tache, duree_effective)
        debut[t.identifiant] = debut_tache
        fin[t.identifiant] = fin_tache

    date_fin_projet = max(fin.values())

    # Passe arrière : date de fin au plus tard, pour repérer les tâches à
    # marge nulle (chemin critique).
    successeurs: dict[str, list[str]] = {t.identifiant: [] for t in projet.taches}
    for t in projet.taches:
        for dep in t.dependances:
            successeurs[dep].append(t.identifiant)

    fin_au_plus_tard: dict[str, date] = {}
    for t in reversed(ordre):
        if successeurs[t.identifiant]:
            fin_au_plus_tard[t.identifiant] = min(
                debut[s] - timedelta(days=1) for s in successeurs[t.identifiant]
            )
        else:
            fin_au_plus_tard[t.identifiant] = date_fin_projet

    lignes = []
    for t in projet.taches:
        marge = (fin_au_plus_tard[t.identifiant] - fin[t.identifiant]).days
        lignes.append(
            LigneEcheancier(
                identifiant=t.identifiant,
                nom=t.nom,
                date_debut=debut[t.identifiant],
                date_fin=fin[t.identifiant],
                duree_jours=t.duree_jours,
                critique=marge <= 0,
                responsable=t.responsable,
            )
        )

    lignes.sort(key=lambda l: l.date_debut)
    duree_totale = sum(
        1
        for _ in _iter_jours_ouvres(début_projet, date_fin_projet)
    )
    return Echeancier(
        projet=projet.nom,
        date_debut=début_projet,
        date_fin=date_fin_projet,
        duree_totale_jours=duree_totale,
        lignes=lignes,
    )


def _iter_jours_ouvres(debut: date, fin: date):
    courant = debut
    while courant <= fin:
        if courant.weekday() < 5:
            yield courant
        courant += timedelta(days=1)
