"""Modèle de données de l'Agent RH.

Toutes les entités sont des ``dataclass`` simples. Les dates sont manipulées
sous forme d'objets :class:`datetime.date`; la sérialisation en base se fait au
format ISO ``AAAA-MM-JJ`` (voir :mod:`agent_rh.repository`).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Optional


class StatutEcheance(str, Enum):
    """Statut calculé d'une échéance en fonction du nombre de jours restants."""

    EXPIRE = "expiré"          # date d'expiration dépassée
    CRITIQUE = "critique"      # expire dans 7 jours ou moins
    URGENT = "urgent"          # expire dans 30 jours ou moins
    A_VENIR = "à venir"        # expire dans 90 jours ou moins
    OK = "ok"                  # au-delà de 90 jours
    SANS_ECHEANCE = "sans échéance"  # pas de date d'expiration connue

    @classmethod
    def depuis_jours(cls, jours_restants: Optional[int]) -> "StatutEcheance":
        """Déduit le statut à partir du nombre de jours avant expiration."""
        if jours_restants is None:
            return cls.SANS_ECHEANCE
        if jours_restants < 0:
            return cls.EXPIRE
        if jours_restants <= 7:
            return cls.CRITIQUE
        if jours_restants <= 30:
            return cls.URGENT
        if jours_restants <= 90:
            return cls.A_VENIR
        return cls.OK

    @property
    def est_alerte(self) -> bool:
        """Vrai si le statut nécessite une action RH (expiré, critique, urgent)."""
        return self in (StatutEcheance.EXPIRE, StatutEcheance.CRITIQUE, StatutEcheance.URGENT)


class TypeDocument(str, Enum):
    """Catégories de documents administratifs suivies par la RH."""

    CONTRAT = "contrat"
    AVENANT = "avenant"
    PIECE_IDENTITE = "piece_identite"
    TITRE_SEJOUR = "titre_sejour"
    VISITE_MEDICALE = "visite_medicale"
    ATTESTATION = "attestation"
    DIPLOME = "diplome"
    RIB = "rib"
    AUTRE = "autre"


@dataclass
class Employe:
    """Un salarié de l'entreprise."""

    matricule: str
    nom: str
    prenom: str
    poste: str = ""
    date_embauche: Optional[date] = None
    email: str = ""
    actif: bool = True
    id: Optional[int] = None

    @property
    def nom_complet(self) -> str:
        return f"{self.prenom} {self.nom}".strip()


@dataclass
class Formation:
    """Une habilitation ou certification obtenue par un salarié."""

    employe_id: int
    intitule: str
    organisme: str = ""
    date_obtention: Optional[date] = None
    date_expiration: Optional[date] = None
    obligatoire: bool = False
    id: Optional[int] = None


@dataclass
class Permis:
    """Un permis de conduire ou une autorisation de conduite d'engins."""

    employe_id: int
    type: str  # ex. "Permis C", "CACES R482 Cat. B1"
    numero: str = ""
    date_obtention: Optional[date] = None
    date_expiration: Optional[date] = None
    id: Optional[int] = None


@dataclass
class Document:
    """Un document administratif rattaché à un salarié."""

    employe_id: int
    type: TypeDocument
    nom_fichier: str
    chemin: str = ""
    date_ajout: Optional[date] = None
    date_expiration: Optional[date] = None
    id: Optional[int] = None


@dataclass
class Echeance:
    """Vue calculée : un élément daté avec son statut d'échéance.

    Produite par l'agent en agrégeant formations, permis et documents afin
    d'offrir une vision unifiée des dates à surveiller.
    """

    employe_id: int
    employe: str            # nom complet, pour affichage
    matricule: str
    categorie: str          # "formation" | "permis" | "document"
    libelle: str            # intitulé lisible de l'élément
    date_expiration: Optional[date]
    jours_restants: Optional[int]
    statut: StatutEcheance = field(default=StatutEcheance.SANS_ECHEANCE)
    obligatoire: bool = False
