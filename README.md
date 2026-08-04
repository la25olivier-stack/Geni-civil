# Agent IA — Chargé de projet (génie civil)

Un agent IA qui assiste le **chargé de projet** sur un chantier de génie civil.
Il remplit trois missions :

1. **Préparer les échéanciers** — enchaînement des tâches selon leurs
   dépendances, dates au plus tôt en jours ouvrés, identification du **chemin
   critique**.
2. **Suivre les coûts** — budget prévu, coût réel engagé et **projection à
   terminaison**, agrégés par tâche et par catégorie.
3. **Alerter sur les dépassements** — détection automatique des dérives de
   **budget** et de **délai**, priorisées (info / attention / critique).

L'agent combine une **couche métier déterministe** (calculs vérifiables, sans
IA) et une **couche IA** basée sur l'**API Claude** (SDK Anthropic) qui raisonne
sur ces données pour produire un point de situation et des recommandations en
français.

## Architecture

```
src/agent_chef_projet/
├── models.py       # Projet, Tache (dataclasses + sérialisation JSON)
├── echeancier.py   # Tri topologique, dates au plus tôt/tard, chemin critique
├── couts.py        # Budget vs réel, projection à terminaison, agrégats
├── alertes.py      # Détection des dépassements de coûts et de délais
├── agent.py        # AgentChefProjet : outils exposés à Claude + analyse IA
└── cli.py          # Interface en ligne de commande
data/exemple_projet.json   # Projet d'exemple : pont routier
tests/test_agent.py        # Tests de la couche métier (sans appel API)
```

La couche métier ne dépend d'aucun service externe : elle est testable et
utilisable **sans clé API**. Seule la commande `analyser` appelle Claude, à qui
elle **expose trois outils** (`obtenir_echeancier`, `obtenir_synthese_couts`,
`obtenir_alertes`). Le modèle ne devine jamais un chiffre : il interroge les
outils, puis rédige la synthèse.

## Installation

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"        # ou : pip install -r requirements.txt
```

## Utilisation

### Commandes déterministes (sans clé API)

```bash
# Échéancier daté + chemin critique
python -m agent_chef_projet echeancier data/exemple_projet.json

# Suivi des coûts (budget / réel / projection, par catégorie)
python -m agent_chef_projet couts data/exemple_projet.json

# Alertes de dépassement à une date donnée
python -m agent_chef_projet alertes data/exemple_projet.json --date 2026-11-15
```

### Analyse IA (nécessite l'API Claude)

```bash
export ANTHROPIC_API_KEY=sk-ant-...     # cf. .env.example

# Point de situation complet rédigé par l'agent
python -m agent_chef_projet analyser data/exemple_projet.json --date 2026-11-15

# Question ciblée
python -m agent_chef_projet analyser data/exemple_projet.json \
    --demande "Quels postes menacent le plus le budget et que faire ?"
```

### En Python

```python
import json
from datetime import date
from agent_chef_projet import AgentChefProjet, Projet

projet = Projet.from_dict(json.load(open("data/exemple_projet.json", encoding="utf-8")))
agent = AgentChefProjet(projet)

agent.echeancier_dict()                 # échéancier structuré
agent.couts_dict()                      # synthèse des coûts
agent.alertes_list(date(2026, 11, 15))  # alertes actives

# Analyse en langage naturel (nécessite ANTHROPIC_API_KEY)
print(agent.analyser(date_analyse=date(2026, 11, 15)))
```

## Format d'un projet

Un projet est un fichier JSON (voir `data/exemple_projet.json`) :

| Champ (tâche)     | Description                                             |
|-------------------|---------------------------------------------------------|
| `identifiant`     | Code unique de la tâche (ex. `T03`)                     |
| `duree_jours`     | Durée en **jours ouvrés**                              |
| `dependances`     | Identifiants des tâches antérieures (fin → début)      |
| `budget_prevu`    | Budget alloué                                          |
| `cout_reel`       | Coût réellement engagé à ce jour                       |
| `avancement_pct`  | Avancement réel (0–100)                                |
| `categorie`       | Regroupement (Études, Gros œuvre, …)                    |

Au niveau du projet : `seuil_alerte_pct` fixe la marge de tolérance (en %) avant
de déclencher une alerte.

## Méthodes de calcul

- **Échéancier** — tri topologique des dépendances, passe *au plus tôt* pour
  dater chaque tâche (jours ouvrés, week-ends exclus), passe *au plus tard* pour
  marquer les tâches à marge nulle (chemin critique).
- **Projection à terminaison** — méthode linéaire : `coût_réel / avancement`.
  Une tâche à 50 % ayant consommé 80 k€ est projetée à 160 k€.
- **Alerte de coût** — la projection dépasse le budget au-delà du seuil.
- **Alerte de délai** — l'avancement réel est en retard sur l'avancement
  théorique attendu à la date d'analyse ; priorité **critique** sur le chemin
  critique.

## Tests

```bash
pytest        # 13 tests, couche métier, sans appel API
```

## Modèle IA

Par défaut `claude-opus-5` (modifiable via `AgentChefProjet(projet, modele=...)`).
L'agent utilise le *tool runner* du SDK Anthropic pour orchestrer les appels
d'outils automatiquement.
