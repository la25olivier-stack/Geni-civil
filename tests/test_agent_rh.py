"""Tests de l'Agent RH.

Exécution : ``python -m unittest discover -s tests`` ou ``python -m pytest -q``.
La date de référence est figée pour rendre les échéances déterministes.
"""

import unittest
from datetime import date, timedelta

from agent_rh import AgentRH, StatutEcheance, TypeDocument
from agent_rh.agent import EmployeIntrouvable

REF = date(2026, 1, 1)  # date « aujourd'hui » figée pour les tests


class BaseAgent(unittest.TestCase):
    def setUp(self):
        # Base en mémoire, isolée par test.
        self.agent = AgentRH(":memory:", aujourdhui=REF)
        self.agent.ajouter_employe(
            matricule="GC001", nom="Martin", prenom="Léa",
            poste="Conducteur d'engins", date_embauche="2020-03-01",
        )

    def tearDown(self):
        self.agent.close()

    @staticmethod
    def dans(jours: int) -> str:
        return (REF + timedelta(days=jours)).isoformat()


class TestEmployes(BaseAgent):
    def test_ajout_et_recuperation(self):
        emp = self.agent.employe("GC001")
        self.assertEqual(emp.nom_complet, "Léa Martin")
        self.assertTrue(emp.actif)
        self.assertEqual(emp.date_embauche, date(2020, 3, 1))

    def test_matricule_inconnu(self):
        with self.assertRaises(EmployeIntrouvable):
            self.agent.employe("INEXISTANT")

    def test_matricule_unique(self):
        with self.assertRaises(Exception):
            self.agent.ajouter_employe(matricule="GC001", nom="Doe", prenom="John")

    def test_desactivation(self):
        self.agent.desactiver_employe("GC001")
        self.assertFalse(self.agent.employe("GC001").actif)
        self.assertEqual(len(self.agent.lister_employes(actifs_seulement=True)), 0)


class TestFormationsPermisDocuments(BaseAgent):
    def test_ajout_formation(self):
        f = self.agent.ajouter_formation(
            matricule="GC001", intitule="CACES R482 B1", organisme="AFTRAL",
            date_obtention="2023-06-15", date_expiration="2028-06-15",
            obligatoire=True,
        )
        self.assertIsNotNone(f.id)
        formations = self.agent.formations("GC001")
        self.assertEqual(len(formations), 1)
        self.assertTrue(formations[0].obligatoire)

    def test_ajout_permis(self):
        self.agent.ajouter_permis(
            matricule="GC001", type="Permis C", numero="123456",
            date_expiration=self.dans(365),
        )
        self.assertEqual(len(self.agent.permis("GC001")), 1)

    def test_ajout_document_type_str(self):
        d = self.agent.ajouter_document(
            matricule="GC001", type="visite_medicale",
            nom_fichier="visite.pdf", date_expiration=self.dans(20),
        )
        self.assertEqual(d.type, TypeDocument.VISITE_MEDICALE)
        self.assertEqual(d.date_ajout, REF)  # renseigné automatiquement

    def test_document_type_invalide(self):
        with self.assertRaises(ValueError):
            self.agent.ajouter_document(
                matricule="GC001", type="type_bidon", nom_fichier="x.pdf")


class TestEcheances(BaseAgent):
    def setUp(self):
        super().setUp()
        # Un échantillon couvrant tous les statuts.
        self.agent.ajouter_formation(
            matricule="GC001", intitule="Habilitation expirée",
            date_expiration=self.dans(-10), obligatoire=True)         # EXPIRE
        self.agent.ajouter_permis(
            matricule="GC001", type="Permis C", date_expiration=self.dans(5))   # CRITIQUE
        self.agent.ajouter_document(
            matricule="GC001", type="visite_medicale", nom_fichier="vm.pdf",
            date_expiration=self.dans(25))                             # URGENT
        self.agent.ajouter_formation(
            matricule="GC001", intitule="SST", date_expiration=self.dans(60))   # A_VENIR
        self.agent.ajouter_formation(
            matricule="GC001", intitule="Lointaine", date_expiration=self.dans(400))  # OK
        # Sans échéance : ne doit jamais apparaître dans les échéances.
        self.agent.ajouter_formation(matricule="GC001", intitule="Sans expiration")

    def test_statuts_calcules(self):
        par_libelle = {e.libelle: e.statut for e in self.agent.echeances()}
        self.assertEqual(par_libelle["Habilitation expirée"], StatutEcheance.EXPIRE)
        self.assertEqual(par_libelle["Permis C"], StatutEcheance.CRITIQUE)
        self.assertEqual(par_libelle["SST"], StatutEcheance.A_VENIR)
        self.assertEqual(par_libelle["Lointaine"], StatutEcheance.OK)

    def test_element_sans_expiration_absent(self):
        libelles = [e.libelle for e in self.agent.echeances()]
        self.assertNotIn("Sans expiration", libelles)

    def test_tri_par_urgence(self):
        echeances = self.agent.echeances()
        jours = [e.jours_restants for e in echeances]
        self.assertEqual(jours, sorted(jours))
        self.assertLess(echeances[0].jours_restants, 0)  # le plus expiré en tête

    def test_filtre_horizon(self):
        # 30 jours : inclut l'expiré (-10), le critique (5) et l'urgent (25).
        proches = self.agent.echeances(dans_jours=30)
        libelles = {e.libelle for e in proches}
        self.assertIn("Habilitation expirée", libelles)
        self.assertIn("Permis C", libelles)
        self.assertIn("visite_medicale — vm.pdf", libelles)
        self.assertNotIn("SST", libelles)

    def test_exclure_expires(self):
        proches = self.agent.echeances(dans_jours=30, inclure_expires=False)
        libelles = {e.libelle for e in proches}
        self.assertNotIn("Habilitation expirée", libelles)

    def test_alertes(self):
        alertes = self.agent.alertes()
        statuts = {e.statut for e in alertes}
        self.assertTrue(statuts.issubset({
            StatutEcheance.EXPIRE, StatutEcheance.CRITIQUE, StatutEcheance.URGENT}))
        self.assertEqual(len(alertes), 3)  # expiré + critique + urgent

    def test_echeances_par_matricule(self):
        self.agent.ajouter_employe(matricule="GC002", nom="Durand", prenom="Paul")
        self.agent.ajouter_permis(
            matricule="GC002", type="Permis B", date_expiration=self.dans(3))
        self.assertEqual(len(self.agent.echeances(matricule="GC002")), 1)


class TestRapport(BaseAgent):
    def test_rapport_synthese(self):
        self.agent.ajouter_formation(
            matricule="GC001", intitule="Expirée",
            date_expiration=self.dans(-1), obligatoire=True)
        self.agent.ajouter_permis(
            matricule="GC001", type="Permis C", date_expiration=self.dans(1000))
        rapport = self.agent.rapport()
        self.assertEqual(rapport["employes_total"], 1)
        self.assertEqual(rapport["formations_total"], 1)
        self.assertEqual(rapport["permis_total"], 1)
        self.assertEqual(rapport["alertes_total"], 1)
        self.assertEqual(rapport["obligatoires_en_alerte"], 1)
        self.assertEqual(rapport["echeances_par_statut"]["expiré"], 1)


class TestStatutEcheance(unittest.TestCase):
    def test_seuils(self):
        self.assertEqual(StatutEcheance.depuis_jours(None), StatutEcheance.SANS_ECHEANCE)
        self.assertEqual(StatutEcheance.depuis_jours(-1), StatutEcheance.EXPIRE)
        self.assertEqual(StatutEcheance.depuis_jours(0), StatutEcheance.CRITIQUE)
        self.assertEqual(StatutEcheance.depuis_jours(7), StatutEcheance.CRITIQUE)
        self.assertEqual(StatutEcheance.depuis_jours(8), StatutEcheance.URGENT)
        self.assertEqual(StatutEcheance.depuis_jours(30), StatutEcheance.URGENT)
        self.assertEqual(StatutEcheance.depuis_jours(31), StatutEcheance.A_VENIR)
        self.assertEqual(StatutEcheance.depuis_jours(90), StatutEcheance.A_VENIR)
        self.assertEqual(StatutEcheance.depuis_jours(91), StatutEcheance.OK)

    def test_est_alerte(self):
        self.assertTrue(StatutEcheance.EXPIRE.est_alerte)
        self.assertTrue(StatutEcheance.CRITIQUE.est_alerte)
        self.assertTrue(StatutEcheance.URGENT.est_alerte)
        self.assertFalse(StatutEcheance.A_VENIR.est_alerte)
        self.assertFalse(StatutEcheance.OK.est_alerte)


if __name__ == "__main__":
    unittest.main()
