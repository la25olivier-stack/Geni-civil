"""Agent RH — gestion des formations, permis, échéances et documents des employés.

Point d'entrée principal : la classe :class:`AgentRH`.
"""

from .agent import AgentRH
from .models import (
    Document,
    Echeance,
    Employe,
    Formation,
    Permis,
    StatutEcheance,
    TypeDocument,
)

__all__ = [
    "AgentRH",
    "Employe",
    "Formation",
    "Permis",
    "Document",
    "Echeance",
    "StatutEcheance",
    "TypeDocument",
]

__version__ = "0.1.0"
