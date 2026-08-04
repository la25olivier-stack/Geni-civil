"""Schémas de données de l'Agent SST.

Les modèles Pydantic servent aussi de schéma de sortie structurée pour l'API
Claude (`messages.parse`). La cotation du risque suit une matrice à 4 niveaux,
inspirée de la méthode INRS (Gravité × Probabilité).
"""

from __future__ import annotations

from enum import Enum, IntEnum
from typing import List, Literal

from pydantic import BaseModel, Field


class Gravite(IntEnum):
    """Gravité du dommage potentiel."""

    FAIBLE = 1  # Blessure/lésion sans arrêt
    MOYENNE = 2  # Accident avec arrêt de travail
    GRAVE = 3  # Incapacité permanente
    MORTELLE = 4  # Accident mortel


class Probabilite(IntEnum):
    """Probabilité de survenue du dommage."""

    TRES_IMPROBABLE = 1
    IMPROBABLE = 2
    PROBABLE = 3
    TRES_PROBABLE = 4


class NiveauRisque(str, Enum):
    """Niveau de priorité issu de la matrice Gravité × Probabilité."""

    ACCEPTABLE = "acceptable"  # 1-3   : maîtrise à surveiller
    MODERE = "modere"  # 4-6   : mesures à planifier
    IMPORTANT = "important"  # 8-9   : mesures à court terme
    CRITIQUE = "critique"  # 12-16 : action immédiate requise


def coter_risque(gravite: int, probabilite: int) -> NiveauRisque:
    """Retourne le niveau de risque à partir de la matrice G × P."""
    produit = gravite * probabilite
    if produit >= 12:
        return NiveauRisque.CRITIQUE
    if produit >= 8:
        return NiveauRisque.IMPORTANT
    if produit >= 4:
        return NiveauRisque.MODERE
    return NiveauRisque.ACCEPTABLE


# --------------------------------------------------------------------------- #
# Analyse de risques
# --------------------------------------------------------------------------- #


class LigneRisque(BaseModel):
    """Une ligne d'analyse de risques (une situation dangereuse)."""

    phase: str = Field(description="Phase ou tâche du chantier concernée")
    danger: str = Field(description="Danger ou source de danger identifié")
    situation_dangereuse: str = Field(
        description="Situation d'exposition au danger"
    )
    dommage_potentiel: str = Field(
        description="Dommage possible pour les personnes (nature de la lésion)"
    )
    gravite: int = Field(ge=1, le=4, description="Gravité 1=faible à 4=mortelle")
    probabilite: int = Field(
        ge=1, le=4, description="Probabilité 1=très improbable à 4=très probable"
    )
    niveau_risque: Literal[
        "acceptable", "modere", "important", "critique"
    ] = Field(description="Niveau de risque issu de la matrice G×P")
    mesures_prevention: List[str] = Field(
        description="Mesures de prévention/protection à mettre en place "
        "(par ordre de priorité : suppression, protection collective, EPI)"
    )
    responsable: str = Field(description="Fonction responsable de la mesure")
    delai: str = Field(description="Échéance de mise en œuvre")


class AnalyseRisques(BaseModel):
    """Analyse de risques complète pour une opération de génie civil."""

    titre: str
    chantier: str
    date: str = Field(description="Date de rédaction au format AAAA-MM-JJ")
    redacteur: str
    perimetre: str = Field(
        description="Périmètre couvert par l'analyse (ouvrages, tâches)"
    )
    lignes: List[LigneRisque]
    synthese: str = Field(
        description="Synthèse : risques majeurs et priorités d'action"
    )


# --------------------------------------------------------------------------- #
# Inspection de chantier
# --------------------------------------------------------------------------- #


class PointInspection(BaseModel):
    """Un point de contrôle d'une inspection de chantier."""

    categorie: str = Field(
        description="Catégorie (ex : échafaudages, EPI, engins, "
        "électricité, circulation, tranchées)"
    )
    point_controle: str = Field(description="Élément vérifié")
    conforme: bool = Field(description="Vrai si conforme")
    constat: str = Field(description="Observation détaillée sur le terrain")
    gravite: int = Field(
        ge=1, le=4, description="Gravité de l'écart 1=faible à 4=mortelle"
    )
    action_corrective: str = Field(
        description="Action corrective attendue (vide si conforme)"
    )
    delai: str = Field(description="Délai de correction (vide si conforme)")


class RapportInspection(BaseModel):
    """Rapport d'inspection de chantier."""

    titre: str
    chantier: str
    date: str = Field(description="Date de l'inspection au format AAAA-MM-JJ")
    inspecteur: str
    points: List[PointInspection]
    taux_conformite: int = Field(
        ge=0, le=100, description="Pourcentage de points conformes"
    )
    synthese: str = Field(
        description="Synthèse : écarts prioritaires et niveau global de sécurité"
    )


# --------------------------------------------------------------------------- #
# Rapport de synthèse SST
# --------------------------------------------------------------------------- #


class RapportSST(BaseModel):
    """Rapport SST de synthèse rédigé (format libre en Markdown)."""

    titre: str
    chantier: str
    date: str
    contenu_markdown: str = Field(
        description="Corps du rapport rédigé en Markdown"
    )
