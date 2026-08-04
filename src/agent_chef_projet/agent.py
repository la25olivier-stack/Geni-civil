"""Agent IA « Chargé de projet ».

L'agent s'appuie sur l'API Claude (SDK Anthropic) pour analyser un projet de
génie civil en langage naturel. Il expose à Claude trois outils déterministes —
échéancier, synthèse des coûts et alertes — puis laisse le modèle raisonner sur
ces données pour produire un point de situation, expliquer les dépassements et
recommander des actions correctives.

La couche métier (echeancier / couts / alertes) reste testable sans clé API ;
seule la synthèse en langage naturel nécessite un appel au modèle.
"""

from __future__ import annotations

import json

from .alertes import detecter_alertes
from .couts import calculer_couts
from .echeancier import generer_echeancier
from .models import Projet

# Modèle Claude par défaut. Voir https://platform.claude.com pour la liste à jour.
MODELE_PAR_DEFAUT = "claude-opus-5"

SYSTEME = """Tu es un chargé de projet expérimenté spécialisé en génie civil.

Ta mission :
- préparer et commenter les échéanciers ;
- suivre les coûts (budget prévu, coût réel, projection à terminaison) ;
- alerter clairement sur les dépassements de délais et de budget.

Méthode de travail :
1. Appelle systématiquement les outils disponibles pour obtenir des chiffres à
   jour avant de conclure — ne devine jamais un montant ou une date.
2. Distingue nettement ce qui est sur le chemin critique du reste.
3. Formule un point de situation concis en français, puis une liste d'actions
   correctives priorisées (les dépassements critiques d'abord).
4. Chiffre systématiquement tes constats (montant, écart en %, jours de retard).

Réponds en français, de façon factuelle et actionnable, sans jargon inutile."""


class AgentChefProjet:
    """Agent IA qui analyse un projet via l'API Claude."""

    def __init__(self, projet: Projet, modele: str = MODELE_PAR_DEFAUT) -> None:
        self.projet = projet
        self.modele = modele

    # ------------------------------------------------------------------ #
    # Accès déterministe (sans API) — réutilisé par les outils et la CLI #
    # ------------------------------------------------------------------ #
    def echeancier_dict(self) -> dict:
        return generer_echeancier(self.projet).to_dict()

    def couts_dict(self) -> dict:
        return calculer_couts(self.projet).to_dict()

    def alertes_list(self, date_analyse=None) -> list[dict]:
        return [a.to_dict() for a in detecter_alertes(self.projet, date_analyse)]

    # ------------------------------------------------------------------ #
    # Analyse en langage naturel via Claude                              #
    # ------------------------------------------------------------------ #
    def analyser(self, demande: str | None = None, date_analyse=None) -> str:
        """Fait analyser le projet par Claude et renvoie le texte produit.

        `demande` : question ou consigne libre (par défaut, un point de
        situation complet). Nécessite le SDK `anthropic` et une clé API.
        """
        try:
            import anthropic
            from anthropic import beta_tool
        except ImportError as exc:  # pragma: no cover - dépend de l'environnement
            raise RuntimeError(
                "Le paquet « anthropic » est requis pour l'analyse IA. "
                "Installez-le avec : pip install anthropic"
            ) from exc

        client = anthropic.Anthropic()

        # Les outils ferment sur `self` pour accéder au projet courant.
        @beta_tool
        def obtenir_echeancier() -> str:
            """Retourne l'échéancier daté du projet (chemin critique inclus)."""
            return json.dumps(self.echeancier_dict(), ensure_ascii=False)

        @beta_tool
        def obtenir_synthese_couts() -> str:
            """Retourne la synthèse des coûts : budget, coût réel et projection."""
            return json.dumps(self.couts_dict(), ensure_ascii=False)

        @beta_tool
        def obtenir_alertes() -> str:
            """Retourne la liste des alertes de dépassement (coûts et délais)."""
            return json.dumps(self.alertes_list(date_analyse), ensure_ascii=False)

        consigne = demande or (
            "Établis un point de situation complet du projet : état de "
            "l'échéancier, suivi des coûts et alertes de dépassement, puis "
            "propose des actions correctives priorisées."
        )

        contexte_projet = (
            f"Projet : {self.projet.nom}\n"
            f"Date de début : {self.projet.date_debut.isoformat()}\n"
            f"Nombre de tâches : {len(self.projet.taches)}\n"
            f"Seuil d'alerte : {self.projet.seuil_alerte_pct} %\n"
            f"Devise : {self.projet.devise}"
        )

        runner = client.beta.messages.tool_runner(
            model=self.modele,
            max_tokens=4096,
            system=SYSTEME,
            tools=[obtenir_echeancier, obtenir_synthese_couts, obtenir_alertes],
            messages=[
                {
                    "role": "user",
                    "content": f"{contexte_projet}\n\nConsigne : {consigne}",
                }
            ],
        )

        message_final = runner.until_done()
        return "".join(
            bloc.text for bloc in message_final.content if bloc.type == "text"
        )
