"""Agent RH — orchestration métier.

La classe :class:`AgentRH` est l'interface de haut niveau : elle enregistre les
salariés, formations, permis et documents, puis calcule les échéances, les
alertes et un rapport de synthèse. Elle s'appuie sur :class:`Repository` pour la
persistance et n'expose que des objets du modèle.
"""

from __future__ import annotations

from datetime import date
from typing import Iterable, Optional

from .models import (
    Document,
    Echeance,
    Employe,
    Formation,
    Permis,
    StatutEcheance,
    TypeDocument,
)
from .repository import Repository


class EmployeIntrouvable(LookupError):
    """Levée lorsqu'aucun salarié ne correspond au matricule fourni."""


class AgentRH:
    """Agent de gestion RH : formations, permis, échéances et documents.

    :param chemin_db: chemin du fichier SQLite (``":memory:"`` pour une base
        temporaire en mémoire, pratique pour les tests).
    :param aujourdhui: date de référence pour le calcul des échéances. Par
        défaut la date du jour ; injectable pour rendre les tests déterministes.
    """

    def __init__(self, chemin_db: str = "data/geni_civil_rh.db",
                 aujourdhui: Optional[date] = None):
        self.repo = Repository(chemin_db)
        self._aujourdhui = aujourdhui

    def close(self) -> None:
        self.repo.close()

    def __enter__(self) -> "AgentRH":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    @property
    def aujourdhui(self) -> date:
        return self._aujourdhui or date.today()

    # ------------------------------------------------------------------ employés
    def ajouter_employe(self, matricule: str, nom: str, prenom: str,
                        poste: str = "", date_embauche: Optional[date | str] = None,
                        email: str = "") -> Employe:
        employe = Employe(
            matricule=matricule, nom=nom, prenom=prenom, poste=poste,
            date_embauche=_as_date(date_embauche), email=email,
        )
        return self.repo.ajouter_employe(employe)

    def employe(self, matricule: str) -> Employe:
        """Retourne un salarié par matricule ou lève :class:`EmployeIntrouvable`."""
        emp = self.repo.employe_par_matricule(matricule)
        if emp is None:
            raise EmployeIntrouvable(f"Aucun salarié avec le matricule {matricule!r}")
        return emp

    def lister_employes(self, actifs_seulement: bool = False) -> list[Employe]:
        return self.repo.lister_employes(actifs_seulement)

    def desactiver_employe(self, matricule: str) -> None:
        self.repo.desactiver_employe(self.employe(matricule).id)

    # ---------------------------------------------------------------- formations
    def ajouter_formation(self, matricule: str, intitule: str, organisme: str = "",
                          date_obtention: Optional[date | str] = None,
                          date_expiration: Optional[date | str] = None,
                          obligatoire: bool = False) -> Formation:
        emp = self.employe(matricule)
        formation = Formation(
            employe_id=emp.id, intitule=intitule, organisme=organisme,
            date_obtention=_as_date(date_obtention),
            date_expiration=_as_date(date_expiration),
            obligatoire=obligatoire,
        )
        return self.repo.ajouter_formation(formation)

    def formations(self, matricule: Optional[str] = None) -> list[Formation]:
        eid = self.employe(matricule).id if matricule else None
        return self.repo.lister_formations(eid)

    # -------------------------------------------------------------------- permis
    def ajouter_permis(self, matricule: str, type: str, numero: str = "",
                       date_obtention: Optional[date | str] = None,
                       date_expiration: Optional[date | str] = None) -> Permis:
        emp = self.employe(matricule)
        permis = Permis(
            employe_id=emp.id, type=type, numero=numero,
            date_obtention=_as_date(date_obtention),
            date_expiration=_as_date(date_expiration),
        )
        return self.repo.ajouter_permis(permis)

    def permis(self, matricule: Optional[str] = None) -> list[Permis]:
        eid = self.employe(matricule).id if matricule else None
        return self.repo.lister_permis(eid)

    # ----------------------------------------------------------------- documents
    def ajouter_document(self, matricule: str, type: TypeDocument | str,
                         nom_fichier: str, chemin: str = "",
                         date_ajout: Optional[date | str] = None,
                         date_expiration: Optional[date | str] = None) -> Document:
        emp = self.employe(matricule)
        document = Document(
            employe_id=emp.id,
            type=TypeDocument(type) if isinstance(type, str) else type,
            nom_fichier=nom_fichier, chemin=chemin,
            date_ajout=_as_date(date_ajout) or self.aujourdhui,
            date_expiration=_as_date(date_expiration),
        )
        return self.repo.ajouter_document(document)

    def documents(self, matricule: Optional[str] = None) -> list[Document]:
        eid = self.employe(matricule).id if matricule else None
        return self.repo.lister_documents(eid)

    # ----------------------------------------------------------------- échéances
    def echeances(self, dans_jours: Optional[int] = None,
                  inclure_expires: bool = True,
                  matricule: Optional[str] = None) -> list[Echeance]:
        """Agrège toutes les échéances (formations, permis, documents).

        :param dans_jours: si fourni, ne conserve que les éléments expirant dans
            ``dans_jours`` jours au plus (les éléments déjà expirés restent
            inclus si ``inclure_expires`` est vrai).
        :param inclure_expires: inclut les éléments dont la date est dépassée.
        :param matricule: restreint à un seul salarié si fourni.

        Le résultat est trié du plus urgent (le plus expiré) au moins urgent.
        """
        filtre_id = self.employe(matricule).id if matricule else None

        # Cache des employés pour éviter une requête par élément.
        employes = {e.id: e for e in self.repo.lister_employes()}
        echeances: list[Echeance] = []

        def ajouter(categorie: str, employe_id: int, libelle: str,
                    date_exp: Optional[date], obligatoire: bool = False) -> None:
            if date_exp is None:
                return  # un élément sans date d'expiration n'est pas une échéance
            emp = employes.get(employe_id)
            if emp is None:
                return
            jours = (date_exp - self.aujourdhui).days
            echeances.append(Echeance(
                employe_id=employe_id,
                employe=emp.nom_complet,
                matricule=emp.matricule,
                categorie=categorie,
                libelle=libelle,
                date_expiration=date_exp,
                jours_restants=jours,
                statut=StatutEcheance.depuis_jours(jours),
                obligatoire=obligatoire,
            ))

        for f in self.repo.lister_formations(filtre_id):
            ajouter("formation", f.employe_id, f.intitule, f.date_expiration, f.obligatoire)
        for p in self.repo.lister_permis(filtre_id):
            ajouter("permis", p.employe_id, p.type, p.date_expiration)
        for d in self.repo.lister_documents(filtre_id):
            libelle = f"{d.type.value} — {d.nom_fichier}"
            ajouter("document", d.employe_id, libelle, d.date_expiration)

        def retenue(e: Echeance) -> bool:
            if e.jours_restants is not None and e.jours_restants < 0 and not inclure_expires:
                return False
            if dans_jours is not None and e.jours_restants is not None:
                return e.jours_restants <= dans_jours
            return True

        resultat = [e for e in echeances if retenue(e)]
        resultat.sort(key=lambda e: (e.jours_restants if e.jours_restants is not None else 10**9))
        return resultat

    def alertes(self, matricule: Optional[str] = None) -> list[Echeance]:
        """Échéances nécessitant une action (expirées, critiques ou urgentes)."""
        return [e for e in self.echeances(matricule=matricule) if e.statut.est_alerte]

    # ------------------------------------------------------------------- rapport
    def rapport(self) -> dict:
        """Synthèse chiffrée de l'état RH, prête à afficher ou sérialiser."""
        employes = self.repo.lister_employes()
        actifs = [e for e in employes if e.actif]
        toutes = self.echeances()

        par_statut: dict[str, int] = {s.value: 0 for s in StatutEcheance}
        for e in toutes:
            par_statut[e.statut.value] += 1

        alertes = [e for e in toutes if e.statut.est_alerte]
        return {
            "date_rapport": self.aujourdhui.isoformat(),
            "employes_total": len(employes),
            "employes_actifs": len(actifs),
            "formations_total": len(self.repo.lister_formations()),
            "permis_total": len(self.repo.lister_permis()),
            "documents_total": len(self.repo.lister_documents()),
            "echeances_par_statut": par_statut,
            "alertes_total": len(alertes),
            "obligatoires_en_alerte": sum(1 for e in alertes if e.obligatoire),
        }


def _as_date(valeur: Optional[date | str]) -> Optional[date]:
    """Normalise une valeur date/chaîne ISO en :class:`datetime.date`."""
    if valeur is None or isinstance(valeur, date):
        return valeur
    return date.fromisoformat(valeur)
