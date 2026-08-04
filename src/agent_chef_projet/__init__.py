"""Agent IA « Chargé de projet » pour le génie civil.

Prépare les échéanciers, suit les coûts et alerte sur les dépassements.
"""

from .agent import AgentChefProjet
from .alertes import Alerte, detecter_alertes
from .couts import SyntheseCouts, calculer_couts
from .echeancier import Echeancier, generer_echeancier
from .models import Priorite, Projet, Tache

__all__ = [
    "AgentChefProjet",
    "Alerte",
    "detecter_alertes",
    "SyntheseCouts",
    "calculer_couts",
    "Echeancier",
    "generer_echeancier",
    "Priorite",
    "Projet",
    "Tache",
]

__version__ = "0.1.0"
