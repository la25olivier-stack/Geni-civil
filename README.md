# Agent de veille des appels d'offres

Agent Python qui **surveille plusieurs plateformes d'appels d'offres publics**
(SEAO, MERX, et d'autres portails configurables), **filtre les avis pertinents**
— par défaut orientés génie civil / infrastructures — et **livre un résumé par
courriel**.

Le résumé est *extractif* et déterministe : il s'appuie sur les champs
structurés des avis (organisme, catégorie, lieu, échéance, valeur estimée,
extrait de description). Aucune clé d'API d'IA n'est requise.

---

## Fonctionnement

```
        ┌─────────┐   ┌─────────┐   ┌──────────────┐
Sources │  SEAO   │   │  MERX   │   │ autres (RSS) │
        └────┬────┘   └────┬────┘   └──────┬───────┘
             └─────────────┼───────────────┘
                           ▼
        Collecte  →  Filtre pertinence  →  Déduplication
        (normalise)   (mots-clés/       (avis déjà vus)
                       catégories)
                           ▼
             Résumé extractif  →  Digest (Markdown + HTML)
                           ▼
                  Livraison par courriel (Gmail SMTP)
```

Étapes détaillées :

1. **Collecte** — chaque source est un adaptateur (`src/appels_offres/sources/`)
   qui récupère puis normalise les avis en objets `Tender`. Une source
   défaillante est journalisée mais n'interrompt pas le cycle.
2. **Fenêtre temporelle** — on ne garde que les avis publiés dans les
   `lookback_days` derniers jours.
3. **Pertinence** — score par mots-clés (`+1`), mots-clés « forts » (`+2`) et
   correspondance de catégorie (`+1`) ; exclusion immédiate sur mots interdits.
   Comparaison insensible à la casse et aux accents, avec frontières de mots.
4. **Déduplication** — les avis déjà signalés (fichier `data/seen.json`) sont
   ignorés pour ne pas envoyer deux fois le même.
5. **Résumé & digest** — génération d'un digest Markdown (archivé) et HTML
   (courriel).
6. **Livraison** — envoi par courriel via SMTP Gmail.

---

## Installation

```bash
pip install -r requirements.txt
```

Python 3.10+ requis.

---

## Configuration

Tout se configure dans [`config/config.yaml`](config/config.yaml). Les valeurs
sensibles sont lues depuis des **variables d'environnement** via la syntaxe
`${VAR}` (ou `${VAR:-valeur_par_defaut}`) — ne committez jamais de secret.

### Sources

```yaml
sources:
  - name: SEAO
    type: seao_opendata          # parseur XML des données ouvertes SEAO
    enabled: true
    url: ${SEAO_XML_URL:-...}

  - name: MERX
    type: rss                    # parseur RSS/Atom générique
    enabled: true
    url: ${MERX_RSS_URL:-}
    options:
      category: appel d'offres public
```

Deux types de source sont fournis :

| type            | usage                                                        |
|-----------------|--------------------------------------------------------------|
| `seao_opendata` | fichier XML des avis SEAO (Données Québec, jeu « seao »)      |
| `rss`           | tout flux RSS 2.0 / Atom (MERX, Constructo, portails, etc.)   |

> **Où trouver les URLs ?**
> - **SEAO** publie ses avis en données ouvertes sur
>   [donneesquebec.ca](https://www.donneesquebec.ca/recherche/dataset/seao).
>   Pointez `SEAO_XML_URL` vers le fichier XML courant (ou un chemin local
>   `file:///chemin/fichier.xml`). Le parseur est tolérant aux variations de
>   nommage des balises ; au besoin, surchargez la correspondance via
>   `options.fields` (voir commentaires dans `config.yaml`).
> - **MERX** expose des flux selon votre recherche / abonnement : renseignez
>   `MERX_RSS_URL` avec l'URL du flux voulu.
>
> Les URLs `file://` et les chemins locaux sont acceptés partout — pratique
> pour rejouer un export téléchargé ou tester hors ligne.

**Ajouter une plateforme** = ajouter une entrée `type: rss` avec son flux. Pour
un site sans flux, on peut écrire un nouvel adaptateur en héritant de
`BaseSource` et en l'enregistrant dans `sources/registry.py`.

### Pertinence (mots-clés)

Adaptez les listes `strong_keywords`, `keywords`, `categories` et
`exclude_keywords` à votre secteur. La configuration par défaut cible le génie
civil (voirie, aqueduc, égout, chaussée, ouvrages d'art, surveillance de
chantier, etc.).

### Courriel (Gmail)

Gmail exige un **mot de passe d'application** :

1. Activez la validation en deux étapes sur le compte Gmail.
2. Créez un mot de passe d'application :
   <https://myaccount.google.com/apppasswords>.
3. Exportez les variables d'environnement :

```bash
export GMAIL_ADDRESS="votre.adresse@gmail.com"
export GMAIL_APP_PASSWORD="xxxxxxxxxxxxxxxx"
```

Le destinataire par défaut est `la25olivier@gmail.com` (modifiable dans
`config.yaml`, clé `email.recipient`).

---

## Utilisation

```bash
# Cycle complet : collecte, filtre, digest, courriel
python run.py

# Sans courriel (produit seulement le digest Markdown dans data/digests/)
python run.py --no-email

# Répétition à blanc : n'écrit rien, n'envoie rien, affiche à l'écran
python run.py --dry-run

# Journalisation détaillée
python run.py -v
```

Le module est aussi utilisable via `python -m` :

```bash
PYTHONPATH=src python -m appels_offres.cli --dry-run
```

---

## Planification (surveillance continue)

### Cron (serveur/local)

```cron
# Tous les jours ouvrables à 7h30
30 7 * * 1-5  cd /chemin/geni-civil && \
  GMAIL_ADDRESS=... GMAIL_APP_PASSWORD=... SEAO_XML_URL=... MERX_RSS_URL=... \
  /usr/bin/python3 run.py >> data/veille.log 2>&1
```

### GitHub Actions

Un workflow planifié est fourni dans
[`.github/workflows/veille.yml`](.github/workflows/veille.yml). Renseignez les
secrets du dépôt (`GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, `SEAO_XML_URL`,
`MERX_RSS_URL`) puis le workflow s'exécutera automatiquement et enverra le
digest par courriel.

---

## Tests

```bash
pip install pytest
python -m pytest tests/ -q
```

Les tests couvrent les parseurs (SEAO XML, RSS/MERX), le filtre de pertinence,
le résumé/digest et l'orchestration de bout en bout, à partir de fixtures
locales — donc sans accès réseau.

---

## Structure du projet

```
config/config.yaml            Configuration (sources, mots-clés, courriel)
run.py                        Point d'entrée : python run.py
src/appels_offres/
  models.py                   Modèle Tender (avis normalisé)
  config.py                   Chargement config + expansion des ${VAR}
  sources/                    Adaptateurs de plateformes
    base.py                   Interface BaseSource (fetch/parse/collect)
    seao.py                   SEAO (données ouvertes XML, tolérant)
    rss.py                    Flux RSS/Atom générique (MERX, autres)
    registry.py               Fabrique type -> classe
  filters.py                  Score de pertinence (mots-clés/catégories)
  summarize.py                Résumé extractif d'un avis
  digest.py                   Digest Markdown / HTML / texte
  delivery/email_gmail.py     Envoi SMTP (Gmail)
  store.py                    Déduplication (data/seen.json)
  agent.py                    Orchestration du cycle complet
  cli.py                      Interface ligne de commande
tests/                        Tests + fixtures
```

## Notes

- Les URLs des flux SEAO/MERX dépendent de votre recherche et de vos
  abonnements ; renseignez-les via les variables d'environnement. Respectez les
  conditions d'utilisation des plateformes lors de la récupération de données.
- Le résumé est volontairement extractif (aucun service externe). Une variante
  LLM pourrait être branchée ultérieurement au niveau de `summarize.py`.
