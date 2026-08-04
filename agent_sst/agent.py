"""Agent SST — orchestration des appels à l'API Claude."""

from __future__ import annotations

import anthropic

from agent_sst import prompts
from agent_sst.schemas import (
    AnalyseRisques,
    RapportInspection,
    RapportSST,
    coter_risque,
)

MODELE_DEFAUT = "claude-opus-5"


class AgentSST:
    """Assistant SST pour le génie civil.

    Prépare les analyses de risques, les inspections de chantier et les
    rapports de synthèse. La cotation du risque renvoyée par le modèle est
    systématiquement recalculée côté client pour garantir la cohérence avec la
    matrice Gravité × Probabilité.
    """

    def __init__(
        self,
        client: anthropic.Anthropic | None = None,
        modele: str = MODELE_DEFAUT,
    ) -> None:
        # Le constructeur sans clé résout ANTHROPIC_API_KEY (ou un profil
        # `ant auth login`) depuis l'environnement.
        self.client = client or anthropic.Anthropic()
        self.modele = modele

    # ------------------------------------------------------------------ #
    # Analyse de risques
    # ------------------------------------------------------------------ #

    def analyser_risques(
        self, description: str, max_tokens: int = 16000
    ) -> AnalyseRisques:
        """Génère une analyse de risques à partir d'une description d'opération."""
        reponse = self.client.messages.parse(
            model=self.modele,
            max_tokens=max_tokens,
            thinking={"type": "adaptive"},
            system=prompts.ANALYSE_RISQUES,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Réalise l'analyse de risques de l'opération suivante :\n\n"
                        f"{description}"
                    ),
                }
            ],
            output_format=AnalyseRisques,
        )
        analyse = reponse.parsed_output
        return self._fiabiliser_cotation(analyse)

    # ------------------------------------------------------------------ #
    # Inspection
    # ------------------------------------------------------------------ #

    def inspecter(
        self, observations: str, max_tokens: int = 16000
    ) -> RapportInspection:
        """Produit un rapport d'inspection à partir d'observations de terrain."""
        reponse = self.client.messages.parse(
            model=self.modele,
            max_tokens=max_tokens,
            thinking={"type": "adaptive"},
            system=prompts.INSPECTION,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Établis le rapport d'inspection à partir de ces "
                        f"observations de chantier :\n\n{observations}"
                    ),
                }
            ],
            output_format=RapportInspection,
        )
        rapport = reponse.parsed_output
        return self._fiabiliser_taux(rapport)

    # ------------------------------------------------------------------ #
    # Rapport de synthèse
    # ------------------------------------------------------------------ #

    def rediger_rapport(
        self, contexte: str, max_tokens: int = 16000
    ) -> RapportSST:
        """Rédige un rapport SST de synthèse en Markdown.

        `contexte` peut contenir une analyse de risques, un rapport
        d'inspection, ou tout élément à synthétiser (texte libre).
        """
        reponse = self.client.messages.parse(
            model=self.modele,
            max_tokens=max_tokens,
            thinking={"type": "adaptive"},
            system=prompts.RAPPORT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Rédige un rapport SST de synthèse à partir des "
                        f"éléments suivants :\n\n{contexte}"
                    ),
                }
            ],
            output_format=RapportSST,
        )
        return reponse.parsed_output

    # ------------------------------------------------------------------ #
    # Fiabilisation côté client
    # ------------------------------------------------------------------ #

    @staticmethod
    def _fiabiliser_cotation(analyse: AnalyseRisques) -> AnalyseRisques:
        """Recalcule niveau_risque à partir de la matrice G×P."""
        for ligne in analyse.lignes:
            ligne.niveau_risque = coter_risque(
                ligne.gravite, ligne.probabilite
            ).value
        return analyse

    @staticmethod
    def _fiabiliser_taux(rapport: RapportInspection) -> RapportInspection:
        """Recalcule le taux de conformité à partir des points."""
        if rapport.points:
            conformes = sum(1 for p in rapport.points if p.conforme)
            rapport.taux_conformite = round(
                100 * conformes / len(rapport.points)
            )
        return rapport
