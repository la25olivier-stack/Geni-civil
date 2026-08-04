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

### Moteur d'IA : gratuit (Ollama) ou Claude

Les agents fonctionnent avec **deux moteurs au choix** :

- **Ollama — gratuit, local, sans clé** (recommandé si vous n'avez pas de clé
  API). Un modèle d'IA tourne directement sur votre ordinateur.
- **Claude** — meilleure qualité, mais nécessite une `ANTHROPIC_API_KEY`
  (payant).

Par défaut : Claude si une clé est présente, **sinon Ollama automatiquement**.
Forçable avec `AGENTS_PROVIDER=ollama` ou `AGENTS_PROVIDER=anthropic`.

**Utiliser Ollama (gratuit) :**

```bash
# 1. Installez Ollama : https://ollama.com
# 2. Téléchargez un modèle qui gère les outils du Directeur général :
ollama pull llama3.1
# 3. Démarrez le serveur Ollama :
ollama serve
# 4. Dans un autre terminal, démarrez l'application (sans clé API) :
npm start
```

Ouvrez `http://localhost:3000/agents.html` : une bannière indique le moteur
actif et s'il est prêt. L'estimateur de plans (vision) reste, lui, sur Claude et
nécessite une clé.

> ℹ️ Ollama demande un ordinateur assez puissant (idéalement 16 Go de RAM). Pour
> une machine plus modeste, essayez un modèle plus léger, p. ex.
> `OLLAMA_MODEL=llama3.2`, puis `ollama pull llama3.2`.

## Prérequis

- Node.js 18+
- **Pour les agents IA** : soit Ollama (gratuit, voir plus haut), soit une clé
  API Anthropic.
- **Pour l'estimateur de plans (vision)** : une clé API Anthropic.

## Installation

```bash
npm install
cp .env.example .env   # configurez le moteur (Ollama gratuit, ou clé Claude)
```

## Lancement

Avec Ollama (gratuit, agents seulement) :

```bash
ollama serve            # dans un terminal
npm start               # dans un autre terminal
```

Avec Claude (agents + estimateur de plans) :

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # ou via un fichier .env chargé par votre shell
npm start
```

Ouvrez ensuite http://localhost:3000/agents.html pour les agents, ou
http://localhost:3000 pour l'estimateur de plans.

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
| `AGENTS_PROVIDER`   | Moteur des agents : `ollama` ou `anthropic` | auto (clé → Claude, sinon Ollama) |
| `OLLAMA_HOST`       | URL du serveur Ollama local             | `http://localhost:11434` |
| `OLLAMA_MODEL`      | Modèle Ollama utilisé par les agents    | `llama3.1`      |
| `ESTIMATEUR_MODEL`  | Modèle vision de l'estimateur (Claude)  | `claude-opus-5` |
| `AGENTS_MODEL`      | Modèle Claude des agents (si Anthropic) | `ESTIMATEUR_MODEL` |
| `PORT`              | Port du serveur                         | `3000`          |

## Limites

Les prix unitaires du bordereau sont **indicatifs** et doivent être ajustés au
contexte réel (région, quantités, contraintes, année). L'outil fournit une aide
au chiffrage de première approche et ne remplace pas un métré détaillé ni le
jugement d'un métreur-économiste.
