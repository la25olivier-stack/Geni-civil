# Estimateur IA — Génie civil

**Analyse vos plans, prépare une première estimation et vérifie les oublis.**

Application web qui exploite l'IA vision de Claude pour lire des plans de génie
civil (images ou PDF), en extraire un métré de première approche, produire une
estimation chiffrée à partir d'un bordereau de prix unitaires, et signaler les
postes fréquemment oubliés.

## Fonctionnement

Le pipeline se déroule en trois étapes :

1. **Analyse des plans** — les fichiers téléversés sont envoyés au modèle vision
   de Claude, qui identifie les ouvrages et estime leurs quantités (avec les
   hypothèses de calcul). La sortie est structurée via `output_config.format`.
2. **Première estimation** — chaque ouvrage est rattaché à une catégorie du
   bordereau (`src/pricing.js`) ; le montant est calculé de façon déterministe
   (quantité × prix unitaire), puis complété par les aléas, honoraires et la TVA.
3. **Vérification des oublis** — les ouvrages détectés sont comparés à une
   check-list métier ; Claude renvoie les postes manquants ou à vérifier, avec
   une gravité.

## Prérequis

- Node.js 18+
- Une clé API Anthropic

## Installation

```bash
npm install
cp .env.example .env   # puis renseignez ANTHROPIC_API_KEY
```

## Lancement

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # ou via un fichier .env chargé par votre shell
npm start
```

Ouvrez ensuite http://localhost:3000, téléversez vos plans (PNG, JPEG, WEBP ou
PDF) et lancez l'estimation.

## Agent 9 — Gestion des équipements

En complément de l'estimateur, un **agent de gestion du parc matériel** (camions,
paveuses, rouleaux, pelles, chargeuses, remorques) est accessible via la page
`equipements.html` (lien depuis l'accueil).

Il suit chaque équipement et calcule de façon **déterministe** :

- **Entretiens** — échéance à l'usage (km / heures) et calendaire (mois) ;
- **Inspections** — contrôle réglementaire à date ;
- **Garanties** — statut (active / bientôt expirée / expirée) et jours restants ;
- **Coûts** — total d'exploitation, ventilation par catégorie, coût au km / à l'heure ;
- **Consommation de carburant** — méthode plein-à-plein, avec écart vs consommation
  de référence pour détecter les dérives.

Un **agent IA** (Claude) analyse ensuite l'ensemble de ces indicateurs et produit
un **plan d'action priorisé** (entretiens et inspections à programmer, réparations
sous garantie à activer, surconsommations, engins à renouveler).

Le parc est conservé **en mémoire** (pas de base de données) et pré-rempli avec un
jeu d'exemples. Endpoints principaux :

| Méthode / route                         | Rôle                                      |
| --------------------------------------- | ----------------------------------------- |
| `GET /api/equipements`                  | Liste du parc + synthèse agrégée          |
| `POST /api/equipements`                 | Ajout d'un équipement                     |
| `PUT /api/equipements/:id`              | Mise à jour d'un équipement               |
| `DELETE /api/equipements/:id`           | Suppression d'un équipement               |
| `POST /api/equipements/:id/operations`  | Ajout d'une opération (entretien, plein…) |
| `POST /api/equipements/plan`            | Plan de maintenance généré par l'agent IA |

## Structure du projet

```
server.js               Serveur Express + endpoints /api/estimation et /api/equipements
src/estimator.js        Appels au modèle Claude (analyse vision + contrôle des oublis)
src/pricing.js          Bordereau de prix unitaires et calcul de l'estimation
src/equipements.js      Agent 9 : parc matériel, indicateurs déterministes + plan IA
public/                 Interface web (HTML/CSS/JS) — estimateur et équipements
```

## Configuration

| Variable            | Rôle                                    | Défaut          |
| ------------------- | --------------------------------------- | --------------- |
| `ANTHROPIC_API_KEY` | Clé API Anthropic (requise)             | —               |
| `ESTIMATEUR_MODEL`  | Modèle vision utilisé                   | `claude-opus-5` |
| `EQUIPEMENTS_MODEL` | Modèle de l'agent équipements           | `ESTIMATEUR_MODEL` |
| `PORT`              | Port du serveur                         | `3000`          |

## Limites

Les prix unitaires du bordereau sont **indicatifs** et doivent être ajustés au
contexte réel (région, quantités, contraintes, année). L'outil fournit une aide
au chiffrage de première approche et ne remplace pas un métré détaillé ni le
jugement d'un métreur-économiste.
