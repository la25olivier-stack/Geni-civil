# Suite IA — Génie civil

**Vos agents IA au service du chantier : estimation, documentation, achats.**

Application web qui regroupe plusieurs agents IA (basés sur Claude) pour une
entreprise de génie civil. Chaque agent est accessible depuis son onglet.

## Les agents

### Estimateur

Lit des plans de génie civil (images ou PDF), en extrait un métré de première
approche, produit une estimation chiffrée à partir d'un bordereau de prix
unitaires, et signale les postes fréquemment oubliés. Le pipeline se déroule en
trois étapes :

1. **Analyse des plans** — les fichiers téléversés sont envoyés au modèle vision
   de Claude, qui identifie les ouvrages et estime leurs quantités (avec les
   hypothèses de calcul). La sortie est structurée via `output_config.format`.
2. **Première estimation** — chaque ouvrage est rattaché à une catégorie du
   bordereau (`src/pricing.js`) ; le montant est calculé de façon déterministe
   (quantité × prix unitaire), puis complété par les aléas, honoraires et la TVA.
3. **Vérification des oublis** — les ouvrages détectés sont comparés à une
   check-list métier ; Claude renvoie les postes manquants ou à vérifier, avec
   une gravité.

### Gestion documentaire (`src/documents.js`)

Classe automatiquement les documents de l'entreprise — contrats, plans,
avenants, photos, procès-verbaux, courriels, fiches techniques, rapports — à
partir d'un fichier (image/PDF) ou d'un texte collé. Pour chaque document, il
extrait le type, le titre, le projet, la date, les intervenants, un montant
éventuel, des mots-clés, un résumé et les actions attendues. Il devient ensuite
le **moteur de recherche** de l'entreprise : une requête en langage naturel
classe les documents archivés par pertinence et propose une synthèse.

> Le fonds documentaire est stocké **en mémoire** et réinitialisé au redémarrage
> du serveur. Pour un usage réel, remplacez le tableau `documents` de
> `server.js` par une base de données persistante.

### Achats (`src/achats.js`)

Compare les offres fournisseurs, prépare les bons de commande, suit les délais
de livraison, compare les prix et suggère des économies. La comparaison chiffrée
(totaux par fournisseur, meilleur prix par article, panier optimisé, économie
potentielle) est **déterministe** ; Claude apporte le jugement : stratégie
d'achat (fournisseur unique / panier optimisé / mixte), leviers d'économies,
risques et conditions. Le bon de commande est ensuite assemblé de façon
déterministe selon la stratégie retenue.

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

## Structure du projet

```
server.js          Serveur Express + endpoints des trois agents
src/estimator.js   Estimateur — analyse vision + contrôle des oublis (Claude)
src/pricing.js     Estimateur — bordereau de prix unitaires et chiffrage
src/documents.js   Gestion documentaire — classement + moteur de recherche
src/achats.js      Achats — comparaison des offres et bon de commande
public/            Interface web à onglets (HTML/CSS/JS)
```

### Points d'entrée de l'API

| Méthode & route                   | Agent               | Rôle                                        |
| --------------------------------- | ------------------- | ------------------------------------------- |
| `POST /api/estimation`            | Estimateur          | Analyse des plans + estimation + oublis     |
| `POST /api/documents/classer`     | Gestion documentaire| Classe et archive un document               |
| `GET  /api/documents`             | Gestion documentaire| Liste le fonds documentaire                 |
| `POST /api/documents/rechercher`  | Gestion documentaire| Recherche en langage naturel                |
| `DELETE /api/documents/:id`       | Gestion documentaire| Retire un document du fonds                 |
| `POST /api/achats/analyser`       | Achats              | Comparatif, économies et bon de commande    |

## Configuration

| Variable             | Rôle                                    | Défaut          |
| -------------------- | --------------------------------------- | --------------- |
| `ANTHROPIC_API_KEY`  | Clé API Anthropic (requise)             | —               |
| `ESTIMATEUR_MODEL`   | Modèle de l'agent Estimateur (vision)   | `claude-opus-5` |
| `GESTIONNAIRE_MODEL` | Modèle de l'agent Gestion documentaire  | `claude-opus-5` |
| `ACHATS_MODEL`       | Modèle de l'agent Achats                | `claude-opus-5` |
| `PORT`               | Port du serveur                         | `3000`          |

## Limites

Les prix unitaires du bordereau sont **indicatifs** et doivent être ajustés au
contexte réel (région, quantités, contraintes, année). L'outil fournit une aide
au chiffrage de première approche et ne remplace pas un métré détaillé ni le
jugement d'un métreur-économiste.
