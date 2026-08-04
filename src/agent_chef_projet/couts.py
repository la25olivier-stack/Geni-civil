"""Suivi des coûts : budget prévu vs coût réel, par tâche et par catégorie.

On calcule aussi une projection à terminaison simple : si une tâche est
avancée à X % et a déjà consommé C, le coût prévu à l'achèvement est estimé à
C / X (méthode du « cost-to-complete » linéaire). Pour X = 0, on retient le
budget prévu.
"""

from __future__ import annotations

from dataclasses import dataclass

from .models import Projet


@dataclass
class LigneCout:
    identifiant: str
    nom: str
    categorie: str
    budget_prevu: float
    cout_reel: float
    avancement_pct: float
    projection_terminaison: float

    @property
    def ecart(self) -> float:
        """Écart projeté par rapport au budget (positif = dépassement)."""
        return self.projection_terminaison - self.budget_prevu

    @property
    def ecart_pct(self) -> float:
        if self.budget_prevu == 0:
            return 0.0
        return self.ecart / self.budget_prevu * 100.0


@dataclass
class SyntheseCouts:
    projet: str
    devise: str
    budget_total: float
    cout_reel_total: float
    projection_totale: float
    lignes: list[LigneCout]

    @property
    def ecart_total(self) -> float:
        return self.projection_totale - self.budget_total

    @property
    def ecart_total_pct(self) -> float:
        if self.budget_total == 0:
            return 0.0
        return self.ecart_total / self.budget_total * 100.0

    def par_categorie(self) -> dict[str, dict[str, float]]:
        agrégat: dict[str, dict[str, float]] = {}
        for l in self.lignes:
            cat = agrégat.setdefault(
                l.categorie,
                {"budget_prevu": 0.0, "cout_reel": 0.0, "projection": 0.0},
            )
            cat["budget_prevu"] += l.budget_prevu
            cat["cout_reel"] += l.cout_reel
            cat["projection"] += l.projection_terminaison
        return agrégat

    def to_dict(self) -> dict:
        return {
            "projet": self.projet,
            "devise": self.devise,
            "budget_total": round(self.budget_total, 2),
            "cout_reel_total": round(self.cout_reel_total, 2),
            "projection_totale": round(self.projection_totale, 2),
            "ecart_total": round(self.ecart_total, 2),
            "ecart_total_pct": round(self.ecart_total_pct, 2),
            "par_categorie": {
                cat: {k: round(v, 2) for k, v in valeurs.items()}
                for cat, valeurs in self.par_categorie().items()
            },
            "lignes": [
                {
                    "identifiant": l.identifiant,
                    "nom": l.nom,
                    "categorie": l.categorie,
                    "budget_prevu": round(l.budget_prevu, 2),
                    "cout_reel": round(l.cout_reel, 2),
                    "avancement_pct": l.avancement_pct,
                    "projection_terminaison": round(l.projection_terminaison, 2),
                    "ecart": round(l.ecart, 2),
                    "ecart_pct": round(l.ecart_pct, 2),
                }
                for l in self.lignes
            ],
        }


def _projeter_terminaison(cout_reel: float, avancement_pct: float, budget: float) -> float:
    """Estime le coût à l'achèvement (méthode linéaire)."""
    if avancement_pct <= 0:
        # Rien de consommé encore de manière significative : on retient le
        # maximum du budget et de ce qui est déjà dépensé.
        return max(budget, cout_reel)
    return cout_reel / (avancement_pct / 100.0)


def calculer_couts(projet: Projet) -> SyntheseCouts:
    """Construit la synthèse des coûts du projet."""
    lignes = []
    for t in projet.taches:
        projection = _projeter_terminaison(t.cout_reel, t.avancement_pct, t.budget_prevu)
        lignes.append(
            LigneCout(
                identifiant=t.identifiant,
                nom=t.nom,
                categorie=t.categorie,
                budget_prevu=t.budget_prevu,
                cout_reel=t.cout_reel,
                avancement_pct=t.avancement_pct,
                projection_terminaison=projection,
            )
        )
    return SyntheseCouts(
        projet=projet.nom,
        devise=projet.devise,
        budget_total=projet.budget_total,
        cout_reel_total=projet.cout_total_reel,
        projection_totale=sum(l.projection_terminaison for l in lignes),
        lignes=lignes,
    )
