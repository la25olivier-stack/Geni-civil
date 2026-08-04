# Agent SST — Génie civil

Assistant **Santé et Sécurité au Travail** pour les chantiers de génie civil.
Il prépare :

- 🧯 les **analyses de risques** (méthode INRS, matrice Gravité × Probabilité) ;
- 🔍 les **inspections de chantier** (points de contrôle, conformité, taux) ;
- 📄 les **rapports SST** de synthèse rédigés en Markdown.

Propulsé par l'API Claude (`claude-opus-5`) avec sorties structurées et
cotation du risque fiabilisée côté client.

## Installation

```bash
pip install -r requirements.txt
cp .env.example .env   # renseignez ANTHROPIC_API_KEY
export ANTHROPIC_API_KEY=sk-ant-...
```

## Utilisation en ligne de commande

```bash
# Analyse de risques d'une opération décrite dans un fichier
python -m agent_sst.cli analyse -f exemples/operation_terrassement.txt -o analyse.md

# Inspection à partir d'observations de terrain
python -m agent_sst.cli inspection -t "Échafaudage sans garde-corps au R+2 ;
plusieurs ouvriers sans casque ; tranchée de 2 m non blindée."

# Rapport de synthèse à partir d'une analyse existante (ou de stdin)
python -m agent_sst.cli rapport -f analyse.md -o rapport.md
cat analyse.md | python -m agent_sst.cli rapport
```

Sans `-o`, le résultat est écrit sur la sortie standard. L'entrée peut être
fournie via `--texte`, `--fichier` ou un pipe (`stdin`).

## Utilisation en Python

```python
from agent_sst import AgentSST
from agent_sst import rendu

agent = AgentSST()  # lit ANTHROPIC_API_KEY dans l'environnement

analyse = agent.analyser_risques(
    "Terrassement en tranchée de 2,5 m avec réseaux existants, pelle 20 t, "
    "coactivité routière, équipe de 4 canalisateurs."
)
print(rendu.analyse_en_markdown(analyse))

# Objets exploitables : parcourir, filtrer, exporter
critiques = [l for l in analyse.lignes if l.niveau_risque == "critique"]
```

## Cotation du risque

| Produit G × P | Niveau        | Action                    |
|:-------------:|---------------|---------------------------|
| 1 – 3         | 🟢 Acceptable | Maîtrise à surveiller     |
| 4 – 6         | 🟡 Modéré     | Mesures à planifier       |
| 8 – 9         | 🟠 Important  | Mesures à court terme     |
| 12 – 16       | 🔴 Critique   | Action immédiate requise  |

Le niveau retourné par le modèle est **recalculé côté client** à partir de la
matrice, pour garantir sa cohérence avec la gravité et la probabilité.

## Structure du projet

```
agent_sst/
  agent.py     # AgentSST : orchestration des appels API
  schemas.py   # Modèles Pydantic (= schémas de sortie structurée)
  prompts.py   # Prompts système (préventeur SST génie civil)
  rendu.py     # Mise en forme Markdown des livrables
  cli.py       # Interface en ligne de commande
exemples/
  operation_terrassement.txt
```

## Limites et bon usage

- Les livrables sont une **aide à la rédaction**, à relire et valider par un
  préventeur ou un coordonnateur SPS avant diffusion.
- Ils ne se substituent pas au PPSPS, au PGC, ni à l'évaluation réglementaire
  des risques par l'employeur.
