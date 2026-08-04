# Geni-civil — Agent RH

Agent RH (Ressources Humaines) pour une entreprise de génie civil.

Il centralise et surveille, pour chaque salarié :

- **Formations** — habilitations et certifications (souvent à renouveler) ;
- **Permis** — permis de conduire et autorisations de conduite d'engins (CACES…) ;
- **Échéances** — dates d'expiration des formations, permis, visites médicales, documents ;
- **Documents** — contrats, pièces d'identité, visites médicales, attestations…

L'agent calcule automatiquement les échéances à venir et les éléments expirés, et
produit des alertes hiérarchisées afin qu'aucune habilitation ne tombe en défaut.

## Installation

Aucune dépendance externe : uniquement la bibliothèque standard Python (≥ 3.10).

```bash
python -m agent_rh.cli --help
```

La base de données est un simple fichier SQLite (`data/geni_civil_rh.db` par défaut).

## Concepts

| Entité      | Description                                                                 |
|-------------|-----------------------------------------------------------------------------|
| `Employe`   | Un salarié (matricule, poste, date d'embauche…).                            |
| `Formation` | Une habilitation/certification, avec date d'obtention et d'expiration.      |
| `Permis`    | Un permis ou une autorisation de conduite (CACES, permis poids lourd…).     |
| `Document`  | Un document administratif rattaché au salarié.                              |
| `Echeance`  | Vue calculée : tout élément daté, avec son statut (expiré, critique, à venir). |

## Utilisation en ligne de commande

```bash
# Ajouter un salarié
python -m agent_rh.cli employe ajouter --matricule GC001 --nom Martin --prenom Léa \
    --poste "Conducteur d'engins" --embauche 2020-03-01

# Enregistrer une formation avec échéance
python -m agent_rh.cli formation ajouter --matricule GC001 \
    --intitule "CACES R482 Cat. B1" --organisme "AFTRAL" \
    --obtention 2023-06-15 --expiration 2028-06-15 --obligatoire

# Enregistrer un permis
python -m agent_rh.cli permis ajouter --matricule GC001 --type "Permis C" \
    --numero 123456 --obtention 2019-01-10 --expiration 2024-01-10

# Ajouter un document
python -m agent_rh.cli document ajouter --matricule GC001 --type visite_medicale \
    --fichier visite_2024.pdf --expiration 2025-04-01

# Lister les échéances des 30 prochains jours (et les éléments expirés)
python -m agent_rh.cli echeances --jours 30

# Alertes critiques
python -m agent_rh.cli alertes

# Rapport global
python -m agent_rh.cli rapport
```

## Utilisation comme bibliothèque

```python
from agent_rh import AgentRH

agent = AgentRH("data/geni_civil_rh.db")
agent.ajouter_employe(matricule="GC001", nom="Martin", prenom="Léa",
                      poste="Conducteur d'engins", date_embauche="2020-03-01")

for e in agent.echeances(dans_jours=30):
    print(e.libelle, e.statut, e.jours_restants)
```

## Tests

```bash
python -m pytest tests/ -q      # ou : python -m unittest discover -s tests
```
