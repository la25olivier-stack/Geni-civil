import Anthropic from "@anthropic-ai/sdk";

// Agent Gestion documentaire.
// Classe automatiquement les documents de l'entreprise (contrats, plans,
// avenants, photos, procès-verbaux, courriels, fiches techniques, rapports)
// et sert de moteur de recherche interne sur le fonds documentaire.

const MODEL = process.env.GESTIONNAIRE_MODEL || "claude-opus-5";

const client = new Anthropic();

// Types de documents reconnus. Le premier terme est la valeur normalisée
// stockée ; le libellé sert à l'affichage.
export const TYPES_DOCUMENTS = {
  contrat: "Contrat",
  plan: "Plan",
  avenant: "Avenant",
  photo: "Photo de chantier",
  proces_verbal: "Procès-verbal",
  courriel: "Courriel",
  fiche_technique: "Fiche technique",
  rapport: "Rapport",
  autre: "Autre / non classé",
};

export function typesDisponibles() {
  return Object.keys(TYPES_DOCUMENTS);
}

/**
 * Construit les blocs de contenu (images / PDF) à envoyer au modèle.
 */
function construireBlocsFichiers(fichiers) {
  return (fichiers || []).map((f) => {
    if (f.mediaType === "application/pdf") {
      return {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: f.data },
      };
    }
    return {
      type: "image",
      source: { type: "base64", media_type: f.mediaType, data: f.data },
    };
  });
}

const SCHEMA_CLASSEMENT = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: typesDisponibles(),
      description: "Type normalisé du document.",
    },
    titre: {
      type: "string",
      description: "Titre court et parlant du document.",
    },
    projet: {
      type: "string",
      description:
        "Projet / chantier / affaire concerné, si identifiable (sinon vide).",
    },
    date: {
      type: "string",
      description:
        "Date du document au format AAAA-MM-JJ si lisible, sinon chaîne vide.",
    },
    parties: {
      type: "array",
      items: { type: "string" },
      description:
        "Intervenants cités : entreprises, maître d'ouvrage, maître d'œuvre, personnes.",
    },
    montant: {
      type: "string",
      description:
        "Montant ou enjeu financier mentionné (avec devise), sinon chaîne vide.",
    },
    motsCles: {
      type: "array",
      items: { type: "string" },
      description: "5 à 10 mots-clés facilitant la recherche ultérieure.",
    },
    resume: {
      type: "string",
      description: "Résumé de 2 à 4 phrases du contenu et de son objet.",
    },
    actionsAttendues: {
      type: "array",
      items: { type: "string" },
      description:
        "Échéances ou actions à mener signalées par le document (sinon liste vide).",
    },
  },
  required: [
    "type",
    "titre",
    "projet",
    "date",
    "parties",
    "montant",
    "motsCles",
    "resume",
    "actionsAttendues",
  ],
  additionalProperties: false,
};

/**
 * Classe un document (fichiers téléversés et/ou texte collé) et en extrait
 * les métadonnées utiles à l'archivage et à la recherche.
 *
 * @param {{fichiers?: Array<{mediaType:string,data:string}>, texte?: string, nomFichier?: string}} entree
 * @returns {Promise<object>} métadonnées de classement
 */
export async function classerDocument({ fichiers, texte, nomFichier } = {}) {
  const blocsFichiers = construireBlocsFichiers(fichiers);

  const aTexte = typeof texte === "string" && texte.trim().length > 0;
  if (blocsFichiers.length === 0 && !aTexte) {
    throw new Error("Aucun document à classer (fichier ou texte requis).");
  }

  const consigne = `Tu es l'archiviste documentaire d'une entreprise de génie civil.
Analyse le document fourni et classe-le pour l'archivage et la recherche.

Détermine :
- son type parmi la nomenclature de l'entreprise,
- un titre clair, le projet/chantier concerné, sa date,
- les intervenants, un éventuel montant, des mots-clés de recherche,
- un résumé synthétique et les actions/échéances éventuelles.

${nomFichier ? `Nom du fichier d'origine : ${nomFichier}\n` : ""}Sois factuel : n'invente pas d'information absente. Laisse un champ vide plutôt
que de deviner. Réponds en français.`;

  const contenu = [...blocsFichiers];
  if (aTexte) {
    contenu.push({ type: "text", text: `Contenu du document :\n${texte.trim()}` });
  }
  contenu.push({ type: "text", text: consigne });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: SCHEMA_CLASSEMENT } },
    messages: [{ role: "user", content: contenu }],
  });

  return extraireJson(response);
}

const SCHEMA_RECHERCHE = {
  type: "object",
  properties: {
    resultats: {
      type: "array",
      description:
        "Documents pertinents pour la requête, du plus au moins pertinent.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Identifiant du document." },
          pertinence: {
            type: "number",
            description: "Score de pertinence de 0 à 100.",
          },
          pourquoi: {
            type: "string",
            description: "En quoi ce document répond à la requête.",
          },
        },
        required: ["id", "pertinence", "pourquoi"],
        additionalProperties: false,
      },
    },
    synthese: {
      type: "string",
      description:
        "Réponse synthétique à la requête en s'appuyant sur les documents trouvés.",
    },
  },
  required: ["resultats", "synthese"],
  additionalProperties: false,
};

/**
 * Moteur de recherche : classe les documents archivés par pertinence vis-à-vis
 * d'une requête en langage naturel et propose une synthèse.
 *
 * @param {string} requete
 * @param {Array<object>} documents documents archivés (avec leurs métadonnées)
 * @returns {Promise<{resultats:Array, synthese:string}>}
 */
export async function rechercher(requete, documents) {
  if (!requete || !requete.trim()) {
    throw new Error("Requête de recherche vide.");
  }
  if (!Array.isArray(documents) || documents.length === 0) {
    return { resultats: [], synthese: "Aucun document archivé pour le moment." };
  }

  const fiches = documents
    .map((d) => {
      const libelle = TYPES_DOCUMENTS[d.type] || d.type;
      return [
        `id: ${d.id}`,
        `type: ${libelle}`,
        `titre: ${d.titre || ""}`,
        `projet: ${d.projet || ""}`,
        `date: ${d.date || ""}`,
        `parties: ${(d.parties || []).join(", ")}`,
        `mots-clés: ${(d.motsCles || []).join(", ")}`,
        `résumé: ${d.resume || ""}`,
      ].join(" | ");
    })
    .join("\n");

  const consigne = `Tu es le moteur de recherche documentaire d'une entreprise de génie civil.

Requête de l'utilisateur : "${requete.trim()}"

Fonds documentaire disponible :
${fiches}

Sélectionne uniquement les documents réellement pertinents pour la requête,
classe-les par pertinence décroissante (score 0-100) et explique brièvement
pourquoi chacun ressort. Fournis une synthèse répondant à la requête à partir
de ces documents. N'invente aucun document : n'utilise que les identifiants
listés ci-dessus. Réponds en français.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: SCHEMA_RECHERCHE } },
    messages: [{ role: "user", content: consigne }],
  });

  return extraireJson(response);
}

function extraireJson(response) {
  if (response.stop_reason === "refusal") {
    throw new Error("La demande a été refusée par le modèle.");
  }
  const bloc = response.content.find((b) => b.type === "text");
  if (!bloc) throw new Error("Réponse du modèle vide.");
  return JSON.parse(bloc.text);
}
