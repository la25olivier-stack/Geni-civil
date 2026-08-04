"""Tests de la couche métier (échéancier, coûts, alertes).

Ces tests sont déterministes et n'appellent pas l'API Claude.
"""

from datetime import date

import pytest

from agent_chef_projet import (
    Projet,
    Tache,
    calculer_couts,
    detecter_alertes,
    generer_echeancier,
)
from agent_chef_projet.echeancier import ajouter_jours_ouvres


# --------------------------------------------------------------------------- #
# Fixtures                                                                     #
# --------------------------------------------------------------------------- #
@pytest.fixture
def projet_simple() -> Projet:
    return Projet(
        nom="Test",
        date_debut=date(2026, 9, 1),  # mardi
        seuil_alerte_pct=5.0,
        taches=[
            Tache("A", "Fondations", 5, [], budget_prevu=100_000, cout_reel=50_000,
                  avancement_pct=50, categorie="Gros oeuvre"),
            Tache("B", "Structure", 10, ["A"], budget_prevu=200_000,
                  categorie="Gros oeuvre"),
            Tache("C", "Finitions", 3, ["B"], budget_prevu=50_000,
                  categorie="Second oeuvre"),
        ],
    )


# --------------------------------------------------------------------------- #
# Jours ouvrés                                                                 #
# --------------------------------------------------------------------------- #
def test_ajouter_jours_ouvres_saute_weekend():
    # Vendredi 4 sept. 2026 + 1 jour ouvré = lundi 7 sept.
    assert ajouter_jours_ouvres(date(2026, 9, 4), 1) == date(2026, 9, 7)


def test_ajouter_zero_jour():
    assert ajouter_jours_ouvres(date(2026, 9, 1), 0) == date(2026, 9, 1)


# --------------------------------------------------------------------------- #
# Échéancier                                                                   #
# --------------------------------------------------------------------------- #
def test_echeancier_enchaine_les_dependances(projet_simple):
    ech = generer_echeancier(projet_simple)
    lignes = {l.identifiant: l for l in ech.lignes}
    # B ne peut commencer qu'après la fin de A.
    assert lignes["B"].date_debut > lignes["A"].date_fin
    assert lignes["C"].date_debut > lignes["B"].date_fin


def test_chemin_critique_couvre_toute_la_chaine(projet_simple):
    ech = generer_echeancier(projet_simple)
    # Chaîne linéaire A → B → C : tout est critique.
    assert set(ech.chemin_critique) == {"A", "B", "C"}


def test_cycle_dependances_leve_erreur():
    projet = Projet(
        nom="Cycle",
        date_debut=date(2026, 9, 1),
        taches=[
            Tache("X", "X", 1, ["Y"]),
            Tache("Y", "Y", 1, ["X"]),
        ],
    )
    with pytest.raises(ValueError, match="Cycle"):
        generer_echeancier(projet)


def test_dependance_inconnue_leve_erreur():
    projet = Projet(
        nom="Manquant",
        date_debut=date(2026, 9, 1),
        taches=[Tache("X", "X", 1, ["INEXISTANT"])],
    )
    with pytest.raises(ValueError, match="dépendance inconnue"):
        generer_echeancier(projet)


# --------------------------------------------------------------------------- #
# Coûts                                                                        #
# --------------------------------------------------------------------------- #
def test_projection_lineaire(projet_simple):
    synthese = calculer_couts(projet_simple)
    ligne_a = next(l for l in synthese.lignes if l.identifiant == "A")
    # 50 000 consommés à 50 % → projection 100 000.
    assert ligne_a.projection_terminaison == pytest.approx(100_000)
    assert ligne_a.ecart == pytest.approx(0)


def test_projection_depassement():
    projet = Projet(
        nom="Dépassement",
        date_debut=date(2026, 9, 1),
        taches=[
            Tache("A", "A", 5, [], budget_prevu=100_000, cout_reel=80_000,
                  avancement_pct=50),
        ],
    )
    synthese = calculer_couts(projet)
    # 80 000 à 50 % → projection 160 000, soit +60 %.
    assert synthese.lignes[0].projection_terminaison == pytest.approx(160_000)
    assert synthese.lignes[0].ecart_pct == pytest.approx(60)


def test_agregation_par_categorie(projet_simple):
    synthese = calculer_couts(projet_simple)
    par_cat = synthese.par_categorie()
    assert par_cat["Gros oeuvre"]["budget_prevu"] == pytest.approx(300_000)
    assert par_cat["Second oeuvre"]["budget_prevu"] == pytest.approx(50_000)


# --------------------------------------------------------------------------- #
# Alertes                                                                      #
# --------------------------------------------------------------------------- #
def test_alerte_cout_declenchee():
    projet = Projet(
        nom="Alerte coût",
        date_debut=date(2026, 9, 1),
        seuil_alerte_pct=5.0,
        taches=[
            Tache("A", "A", 5, [], budget_prevu=100_000, cout_reel=80_000,
                  avancement_pct=50),
        ],
    )
    alertes = detecter_alertes(projet, date_analyse=date(2026, 9, 1))
    types_couts = [a for a in alertes if a.type == "cout"]
    assert types_couts, "Une alerte de coût devait être levée."
    assert types_couts[0].priorite.value == "critique"  # +60 % >> 3×5 %


def test_alerte_delai_sur_chemin_critique():
    projet = Projet(
        nom="Retard",
        date_debut=date(2026, 9, 1),
        seuil_alerte_pct=5.0,
        taches=[
            # Tâche démarrée, avancement nul alors qu'elle devrait être avancée.
            Tache("A", "A", 10, [], budget_prevu=100_000, avancement_pct=0),
        ],
    )
    # 5 jours ouvrés après le début, ~50 % attendus, 0 % réalisés → retard.
    alertes = detecter_alertes(projet, date_analyse=date(2026, 9, 8))
    delais = [a for a in alertes if a.type == "delai"]
    assert delais, "Une alerte de délai devait être levée."
    assert delais[0].priorite.value == "critique"  # tâche unique = critique


def test_aucune_alerte_projet_sain():
    projet = Projet(
        nom="Sain",
        date_debut=date(2026, 9, 1),
        seuil_alerte_pct=5.0,
        taches=[
            Tache("A", "A", 5, [], budget_prevu=100_000, cout_reel=50_000,
                  avancement_pct=50),
        ],
    )
    alertes = detecter_alertes(projet, date_analyse=date(2026, 9, 1))
    assert alertes == []


# --------------------------------------------------------------------------- #
# Sérialisation                                                                #
# --------------------------------------------------------------------------- #
def test_projet_roundtrip(projet_simple):
    données = projet_simple.to_dict()
    reconstruit = Projet.from_dict(données)
    assert reconstruit.nom == projet_simple.nom
    assert reconstruit.date_debut == projet_simple.date_debut
    assert len(reconstruit.taches) == len(projet_simple.taches)
