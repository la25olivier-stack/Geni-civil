# Estimateur IA — Génie civil

**Analyse vos plans, prépare une première estimation et vérifie les oublis.**

Application web qui exploite l'IA vision de Claude pour lire des plans de génie
civil (images ou PDF), en extraire un métré de première approche, produire une
estimation chiffrée à partir d'un bordereau de prix unitaires, et signaler les
postes fréquemment oubliés.

Elle embarque aussi un **Directeur général IA** : un agent qui coordonne la
vision d'ensemble de l'entreprise (rapports, KPI, risques, décisions).

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

## Directeur général IA ⭐

Second module de l'application, accessible via `direction.html` (lien dans
l'en-tête). C'est l'agent qui **coordonne tous les autres** et éclaire la
direction. Il est capable de :

- produire un **rapport quotidien et hebdomadaire** ;
- **identifier les problèmes prioritaires** ;
- **suivre les KPI** de l'entreprise (chiffre d'affaires, marges, carnet de
  commandes, trésorerie…) ;
- **proposer des décisions fondées sur les données** ;
- **répondre aux questions de la direction** en langage naturel, par exemple :
  - « Quels projets perdent de l'argent ? »
  - « Quel client est le plus rentable cette année ? »
  - « Quels sont les 10 plus gros risques cette semaine ? »

Comme pour l'estimation, la logique repose sur une séparation nette entre
**calculs déterministes** et **raisonnement de l'IA** : `src/data.js` agrège les
données de l'entreprise (portefeuille de projets, coûts, facturation, risques) et
calcule un tableau de bord fiable (KPI, projets déficitaires, rentabilité par
client, classement des risques). Ce tableau de bord est ensuite transmis au
modèle (`src/directeur.js`), qui synthétise, hiérarchise et propose des
décisions — sans jamais inventer de chiffres.

> Les données de `src/data.js` sont des **données de démonstration**. Pour un
> usage réel, branchez ce module sur votre ERP / logiciel de gestion en
> remplaçant le contenu de `PROJETS` (ou en alimentant les mêmes structures).

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
server.js          Serveur Express + endpoints /api/estimation et /api/direction/*
src/estimator.js   Appels au modèle Claude (analyse vision + contrôle des oublis)
src/pricing.js     Bordereau de prix unitaires et calcul de l'estimation
src/data.js        Données de l'entreprise + calcul du tableau de bord (KPI, risques)
src/directeur.js   Directeur général IA (rapports et réponses aux questions)
public/            Interface web (HTML/CSS/JS) — estimateur + direction
```

### Endpoints du Directeur général IA

| Méthode | Route                             | Rôle                                            |
| ------- | --------------------------------- | ----------------------------------------------- |
| `GET`   | `/api/direction/tableau-de-bord`  | KPI et données agrégées (déterministe, sans IA) |
| `POST`  | `/api/direction/rapport`          | Rapport `quotidien` ou `hebdomadaire`           |
| `POST`  | `/api/direction/question`         | Réponse à une question libre de la direction    |

## Configuration

| Variable            | Rôle                                    | Défaut          |
| ------------------- | --------------------------------------- | --------------- |
| `ANTHROPIC_API_KEY` | Clé API Anthropic (requise)             | —               |
| `ESTIMATEUR_MODEL`  | Modèle vision utilisé                   | `claude-opus-5` |
| `DIRECTEUR_MODEL`   | Modèle du Directeur général IA          | `claude-opus-5` |
| `PORT`              | Port du serveur                         | `3000`          |

## Limites

Les prix unitaires du bordereau sont **indicatifs** et doivent être ajustés au
contexte réel (région, quantités, contraintes, année). L'outil fournit une aide
au chiffrage de première approche et ne remplace pas un métré détaillé ni le
jugement d'un métreur-économiste.
