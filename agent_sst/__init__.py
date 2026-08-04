"""Agent SST — Santé et Sécurité au Travail pour le génie civil.

Prépare les analyses de risques, les inspections de chantier et les rapports
à l'aide de l'API Claude.
"""

from agent_sst.agent import AgentSST
from agent_sst.schemas import (
    AnalyseRisques,
    LigneRisque,
    RapportInspection,
    PointInspection,
    RapportSST,
)

__all__ = [
    "AgentSST",
    "AnalyseRisques",
    "LigneRisque",
    "RapportInspection",
    "PointInspection",
    "RapportSST",
]

__version__ = "0.1.0"
