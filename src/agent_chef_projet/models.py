"""Modèles de données du domaine « gestion de projet de génie civil ».

Ce module ne contient que des structures de données pures (dataclasses) et la
logique de sérialisation. Les calculs (échéancier, coûts, alertes) vivent dans
les modules dédiés.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date
from enum import Enum
from typing import Any


class Priorite(str, Enum):
    """Niveau de priorité d'une alerte."""

    INFO = "info"
    ATTENTION = "attention"
    CRITIQUE = "critique"


@dataclass
class Tache:
    """Une tâche du projet.

    Les durées sont exprimées en jours ouvrés. Les dépendances sont de type
    « fin → début » : une tâche ne peut commencer qu'une fois toutes ses
    tâches antérieures terminées.
    """

    identifiant: str
    nom: str
    duree_jours: int
    dependances: list[str] = field(default_factory=list)
    budget_prevu: float = 0.0
    cout_reel: float = 0.0
    avancement_pct: float = 0.0
    categorie: str = "Général"
    responsable: str = ""

    def __post_init__(self) -> None:
        if self.duree_jours < 0:
            raise ValueError(
                f"Tâche {self.identifiant} : la durée ne peut être négative."
            )
        if not 0.0 <= self.avancement_pct <= 100.0:
            raise ValueError(
                f"Tâche {self.identifiant} : l'avancement doit être entre 0 et 100."
            )


@dataclass
class Projet:
    """Un projet de construction avec ses tâches et son calendrier."""

    nom: str
    date_debut: date
    taches: list[Tache] = field(default_factory=list)
    # Marge de tolérance (en %) avant de déclencher une alerte de dépassement.
    seuil_alerte_pct: float = 5.0
    devise: str = "EUR"

    def tache(self, identifiant: str) -> Tache:
        """Retourne la tâche portant cet identifiant (lève KeyError sinon)."""
        for t in self.taches:
            if t.identifiant == identifiant:
                return t
        raise KeyError(f"Tâche introuvable : {identifiant}")

    @property
    def budget_total(self) -> float:
        return sum(t.budget_prevu for t in self.taches)

    @property
    def cout_total_reel(self) -> float:
        return sum(t.cout_reel for t in self.taches)

    # ------------------------------------------------------------------ #
    # Sérialisation                                                       #
    # ------------------------------------------------------------------ #
    def to_dict(self) -> dict[str, Any]:
        données = asdict(self)
        données["date_debut"] = self.date_debut.isoformat()
        return données

    @classmethod
    def from_dict(cls, données: dict[str, Any]) -> "Projet":
        taches = [Tache(**t) for t in données.get("taches", [])]
        return cls(
            nom=données["nom"],
            date_debut=date.fromisoformat(données["date_debut"]),
            taches=taches,
            seuil_alerte_pct=données.get("seuil_alerte_pct", 5.0),
            devise=données.get("devise", "EUR"),
        )
