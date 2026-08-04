"""Couche de persistance SQLite pour l'Agent RH.

Le :class:`Repository` isole tout l'accès à la base : création du schéma,
conversion entre lignes SQL et dataclasses du modèle, et opérations CRUD.
La logique métier (échéances, alertes, rapports) reste dans
:mod:`agent_rh.agent`.
"""

from __future__ import annotations

import sqlite3
from datetime import date
from pathlib import Path
from typing import Optional

from .models import Document, Employe, Formation, Permis, TypeDocument

SCHEMA = """
CREATE TABLE IF NOT EXISTS employes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    matricule     TEXT NOT NULL UNIQUE,
    nom           TEXT NOT NULL,
    prenom        TEXT NOT NULL,
    poste         TEXT NOT NULL DEFAULT '',
    date_embauche TEXT,
    email         TEXT NOT NULL DEFAULT '',
    actif         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS formations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employe_id      INTEGER NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
    intitule        TEXT NOT NULL,
    organisme       TEXT NOT NULL DEFAULT '',
    date_obtention  TEXT,
    date_expiration TEXT,
    obligatoire     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS permis (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employe_id      INTEGER NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,
    numero          TEXT NOT NULL DEFAULT '',
    date_obtention  TEXT,
    date_expiration TEXT
);

CREATE TABLE IF NOT EXISTS documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    employe_id      INTEGER NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,
    nom_fichier     TEXT NOT NULL,
    chemin          TEXT NOT NULL DEFAULT '',
    date_ajout      TEXT,
    date_expiration TEXT
);

CREATE INDEX IF NOT EXISTS idx_formations_employe ON formations(employe_id);
CREATE INDEX IF NOT EXISTS idx_permis_employe     ON permis(employe_id);
CREATE INDEX IF NOT EXISTS idx_documents_employe  ON documents(employe_id);
"""


def _d(valeur: Optional[str]) -> Optional[date]:
    """Convertit une chaîne ISO en date (ou None)."""
    return date.fromisoformat(valeur) if valeur else None


def _s(valeur: Optional[date]) -> Optional[str]:
    """Convertit une date en chaîne ISO (ou None)."""
    return valeur.isoformat() if valeur else None


class Repository:
    """Accès aux données. Peut être utilisé comme gestionnaire de contexte."""

    def __init__(self, chemin_db: str = "data/geni_civil_rh.db"):
        self.chemin_db = chemin_db
        if chemin_db != ":memory:":
            Path(chemin_db).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(chemin_db)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(SCHEMA)

    def __enter__(self) -> "Repository":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()

    def close(self) -> None:
        self.conn.close()

    # ------------------------------------------------------------------ employés
    def ajouter_employe(self, employe: Employe) -> Employe:
        cur = self.conn.execute(
            """INSERT INTO employes (matricule, nom, prenom, poste, date_embauche, email, actif)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (employe.matricule, employe.nom, employe.prenom, employe.poste,
             _s(employe.date_embauche), employe.email, int(employe.actif)),
        )
        self.conn.commit()
        employe.id = cur.lastrowid
        return employe

    def employe_par_matricule(self, matricule: str) -> Optional[Employe]:
        row = self.conn.execute(
            "SELECT * FROM employes WHERE matricule = ?", (matricule,)
        ).fetchone()
        return self._row_employe(row) if row else None

    def employe_par_id(self, employe_id: int) -> Optional[Employe]:
        row = self.conn.execute(
            "SELECT * FROM employes WHERE id = ?", (employe_id,)
        ).fetchone()
        return self._row_employe(row) if row else None

    def lister_employes(self, actifs_seulement: bool = False) -> list[Employe]:
        sql = "SELECT * FROM employes"
        if actifs_seulement:
            sql += " WHERE actif = 1"
        sql += " ORDER BY nom, prenom"
        return [self._row_employe(r) for r in self.conn.execute(sql)]

    def desactiver_employe(self, employe_id: int) -> None:
        self.conn.execute("UPDATE employes SET actif = 0 WHERE id = ?", (employe_id,))
        self.conn.commit()

    # ---------------------------------------------------------------- formations
    def ajouter_formation(self, formation: Formation) -> Formation:
        cur = self.conn.execute(
            """INSERT INTO formations
               (employe_id, intitule, organisme, date_obtention, date_expiration, obligatoire)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (formation.employe_id, formation.intitule, formation.organisme,
             _s(formation.date_obtention), _s(formation.date_expiration),
             int(formation.obligatoire)),
        )
        self.conn.commit()
        formation.id = cur.lastrowid
        return formation

    def lister_formations(self, employe_id: Optional[int] = None) -> list[Formation]:
        if employe_id is None:
            rows = self.conn.execute("SELECT * FROM formations")
        else:
            rows = self.conn.execute(
                "SELECT * FROM formations WHERE employe_id = ?", (employe_id,)
            )
        return [self._row_formation(r) for r in rows]

    # -------------------------------------------------------------------- permis
    def ajouter_permis(self, permis: Permis) -> Permis:
        cur = self.conn.execute(
            """INSERT INTO permis (employe_id, type, numero, date_obtention, date_expiration)
               VALUES (?, ?, ?, ?, ?)""",
            (permis.employe_id, permis.type, permis.numero,
             _s(permis.date_obtention), _s(permis.date_expiration)),
        )
        self.conn.commit()
        permis.id = cur.lastrowid
        return permis

    def lister_permis(self, employe_id: Optional[int] = None) -> list[Permis]:
        if employe_id is None:
            rows = self.conn.execute("SELECT * FROM permis")
        else:
            rows = self.conn.execute(
                "SELECT * FROM permis WHERE employe_id = ?", (employe_id,)
            )
        return [self._row_permis(r) for r in rows]

    # ----------------------------------------------------------------- documents
    def ajouter_document(self, document: Document) -> Document:
        cur = self.conn.execute(
            """INSERT INTO documents
               (employe_id, type, nom_fichier, chemin, date_ajout, date_expiration)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (document.employe_id, document.type.value, document.nom_fichier,
             document.chemin, _s(document.date_ajout), _s(document.date_expiration)),
        )
        self.conn.commit()
        document.id = cur.lastrowid
        return document

    def lister_documents(self, employe_id: Optional[int] = None) -> list[Document]:
        if employe_id is None:
            rows = self.conn.execute("SELECT * FROM documents")
        else:
            rows = self.conn.execute(
                "SELECT * FROM documents WHERE employe_id = ?", (employe_id,)
            )
        return [self._row_document(r) for r in rows]

    # ---------------------------------------------------------- convertisseurs
    @staticmethod
    def _row_employe(row: sqlite3.Row) -> Employe:
        return Employe(
            id=row["id"],
            matricule=row["matricule"],
            nom=row["nom"],
            prenom=row["prenom"],
            poste=row["poste"],
            date_embauche=_d(row["date_embauche"]),
            email=row["email"],
            actif=bool(row["actif"]),
        )

    @staticmethod
    def _row_formation(row: sqlite3.Row) -> Formation:
        return Formation(
            id=row["id"],
            employe_id=row["employe_id"],
            intitule=row["intitule"],
            organisme=row["organisme"],
            date_obtention=_d(row["date_obtention"]),
            date_expiration=_d(row["date_expiration"]),
            obligatoire=bool(row["obligatoire"]),
        )

    @staticmethod
    def _row_permis(row: sqlite3.Row) -> Permis:
        return Permis(
            id=row["id"],
            employe_id=row["employe_id"],
            type=row["type"],
            numero=row["numero"],
            date_obtention=_d(row["date_obtention"]),
            date_expiration=_d(row["date_expiration"]),
        )

    @staticmethod
    def _row_document(row: sqlite3.Row) -> Document:
        return Document(
            id=row["id"],
            employe_id=row["employe_id"],
            type=TypeDocument(row["type"]),
            nom_fichier=row["nom_fichier"],
            chemin=row["chemin"],
            date_ajout=_d(row["date_ajout"]),
            date_expiration=_d(row["date_expiration"]),
        )
