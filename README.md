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

## Fonctionnalités complémentaires

- **Prix unitaires éditables** — chaque prix du tableau d'estimation est
  modifiable ; les totaux (aléas, honoraires, TVA) se recalculent
  automatiquement.
- **Export CSV** — téléchargement du bordereau et de la synthèse au format CSV
  (compatible Excel, séparateur `;`, encodage UTF-8).
- **Impression / PDF** — mise en page dédiée à l'impression, exportable en PDF
  via la boîte de dialogue d'impression du navigateur.
- **Historique des projets** — enregistrement des estimations réalisées pour les
  retrouver, les recharger et les comparer. Les projets sont stockés côté serveur
  dans `data/historique.json`.

## Structure du projet

```
server.js          Serveur Express + endpoints API
src/estimator.js   Appels au modèle Claude (analyse vision + contrôle des oublis)
src/pricing.js     Bordereau de prix unitaires et calcul de l'estimation
src/historique.js  Stockage des projets enregistrés (fichier JSON)
public/            Interface web (HTML/CSS/JS)
```

## API

| Méthode & route            | Rôle                                             |
| -------------------------- | ------------------------------------------------ |
| `POST /api/estimation`     | Analyse des plans → estimation → contrôle oublis |
| `GET  /api/bordereau`      | Catalogue de prix unitaires et paramètres        |
| `GET  /api/historique`     | Liste des projets enregistrés                    |
| `POST /api/historique`     | Enregistre une estimation                        |
| `GET  /api/historique/:id` | Récupère un projet complet                       |
| `DELETE /api/historique/:id` | Supprime un projet                             |

## Configuration

| Variable            | Rôle                                    | Défaut          |
| ------------------- | --------------------------------------- | --------------- |
| `ANTHROPIC_API_KEY` | Clé API Anthropic (requise)             | —               |
| `ESTIMATEUR_MODEL`  | Modèle vision utilisé                   | `claude-opus-5` |
| `PORT`              | Port du serveur                         | `3000`          |

## Limites

Les prix unitaires du bordereau sont **indicatifs** et doivent être ajustés au
contexte réel (région, quantités, contraintes, année). L'outil fournit une aide
au chiffrage de première approche et ne remplace pas un métré détaillé ni le
jugement d'un métreur-économiste.
