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

## Agents IA de l'entreprise

En plus de l'estimateur de plans, l'application héberge une **équipe de 12 agents
IA** spécialisés, coordonnée par un **Directeur général IA**. Interface :
`http://localhost:3000/agents.html`.

| # | Agent | Rôle principal |
| - | ----- | -------------- |
| 1 | 🧭 Directeur général | Coordonne les agents, suit les KPI, propose des décisions |
| 2 | 💰 Directeur financier | Trésorerie, marges, rentabilité, comptes, coûts |
| 3 | 📐 Estimateur | Métré, ressources, oublis, première estimation |
| 4 | 🏗️ Chargé de projet | Coûts, avancement, échéancier, changements, extras |
| 5 | 📋 Appels d'offres | SEAO, MERX, Hydro-Québec, municipalités, Rio Tinto |
| 6 | 👷 RH | Formations, permis, certificats, CCQ, intégration |
| 7 | 🦺 SST | Analyses de risques, inspections, incidents, CNESST |
| 8 | ✅ Qualité | Conformité devis, normes MTQ, essais, déficiences |
| 9 | 🚜 Équipements | Flotte, entretiens, garanties, coûts, carburant |
| 10 | 🗂️ Gestion documentaire | Classement et recherche de tous les documents |
| 11 | 🛒 Achats | Fournisseurs, bons de commande, délais, économies |
| 12 | ⚖️ Juridique | Contrats, clauses à risque, assurances, avis de changement |

### Comment ils communiquent

Le **Directeur général** est l'orchestrateur. Quand on lui pose une question
(ex. « Quels projets perdent de l'argent ? »), il consulte automatiquement les
agents spécialistes concernés via le mécanisme d'outils (*tool use*) de Claude,
récupère leurs réponses structurées, puis produit une synthèse pour la
direction. L'interface affiche la synthèse **et** le détail des agents consultés.

```
                    Directeur général IA
                            │
      ┌─────────────────────┼──────────────────────┐
 Directeur financier   Chargé de projet      Appels d'offres
                            │                       │
                      Estimateur IA         Gestion documentaire
        ┌─────────────┬──────────────┬──────────────┐
     RH IA          SST IA        Achats IA     Juridique IA
        │              │
   Équipements IA   Qualité IA
```

### API des agents

| Endpoint | Méthode | Description |
| -------- | ------- | ----------- |
| `/api/agents` | GET | Liste des agents (métadonnées, organigramme) |
| `/api/agents/:id` | POST | Interroge un agent précis — corps `{ question, contexte? }` |
| `/api/dg` | POST | Interroge le Directeur général (orchestration) — `{ question, contexte? }` |

Les agents raisonnent à partir du **contexte fourni** dans la requête et de leur
expertise métier ; les sources (Acomba, SEAO, Google Drive, courriels…) sont les
connecteurs visés. Tant qu'un connecteur n'est pas branché, l'agent signale les
données qui lui manqueraient pour être précis.

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
server.js                 Serveur Express + endpoints /api/estimation, /api/agents, /api/dg
src/estimator.js          Appels au modèle Claude (analyse vision + contrôle des oublis)
src/pricing.js            Bordereau de prix unitaires et calcul de l'estimation
src/agents/definitions.js Définition des 12 agents (rôles, sources, prompts, organigramme)
src/agents/runtime.js     Exécution d'un agent + orchestration multi-agents du DG
public/index.html         Interface de l'estimateur de plans
public/agents.html        Interface des agents IA (chat + organigramme)
```

## Configuration

| Variable            | Rôle                                    | Défaut          |
| ------------------- | --------------------------------------- | --------------- |
| `ANTHROPIC_API_KEY` | Clé API Anthropic (requise)             | —               |
| `ESTIMATEUR_MODEL`  | Modèle vision utilisé                   | `claude-opus-5` |
| `AGENTS_MODEL`      | Modèle utilisé par les agents IA        | `ESTIMATEUR_MODEL` |
| `PORT`              | Port du serveur                         | `3000`          |

## Limites

Les prix unitaires du bordereau sont **indicatifs** et doivent être ajustés au
contexte réel (région, quantités, contraintes, année). L'outil fournit une aide
au chiffrage de première approche et ne remplace pas un métré détaillé ni le
jugement d'un métreur-économiste.
