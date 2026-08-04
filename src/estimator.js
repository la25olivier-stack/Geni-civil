import Anthropic from "@anthropic-ai/sdk";
import { categoriesDisponibles } from "./pricing.js";

const MODEL = process.env.ESTIMATEUR_MODEL || "claude-opus-5";

const client = new Anthropic();

// Check-list des postes fréquemment oubliés en phase d'estimation génie civil.
// Sert de référentiel à l'IA pour repérer les manques dans les plans analysés.
const CHECKLIST_OUBLIS = [
  "Installation et repli de chantier",
  "Terrassements (déblais, remblais, évacuation des terres)",
  "Rabattement de nappe / épuisement des eaux",
  "Blindage / soutènement des fouilles",
  "Béton de propreté sous les fondations",
  "Armatures (aciers) associées aux volumes de béton",
  "Coffrages associés aux ouvrages béton",
  "Joints de dilatation et de reprise",
  "Étanchéité et drainage des ouvrages enterrés",
  "Réseaux VRD et raccordements (eau, EU/EP, électricité, télécom)",
  "Assainissement (regards, canalisations, exutoires)",
  "Voirie et aménagements extérieurs",
  "Reprises en sous-oeuvre / traitement des existants",
  "Essais, contrôles et épreuves (béton, compactage, étanchéité)",
  "Sécurité collective, signalisation et gardiennage",
  "Gestion et évacuation des déchets",
  "Provision pour aléas géotechniques",
];

/**
 * Construit les blocs de contenu (images / PDF) à envoyer au modèle vision.
 */
function construireBlocsFichiers(fichiers) {
  return fichiers.map((f) => {
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

const SCHEMA_EXTRACTION = {
  type: "object",
  properties: {
    projet: {
      type: "string",
      description: "Description synthétique du projet et du type d'ouvrage.",
    },
    ouvrages: {
      type: "array",
      description: "Liste des ouvrages / postes détectés sur les plans.",
      items: {
        type: "object",
        properties: {
          poste: { type: "string" },
          categorie: {
            type: "string",
            enum: categoriesDisponibles(),
            description: "Catégorie normalisée du bordereau de prix.",
          },
          description: { type: "string" },
          quantite: {
            type: "number",
            description: "Quantité estimée dans l'unité indiquée.",
          },
          unite: {
            type: "string",
            description: "Unité (m2, m3, ml, kg, u, ft...).",
          },
          hypotheses: {
            type: "string",
            description:
              "Hypothèses de calcul (dimensions lues, ratios appliqués, incertitudes).",
          },
        },
        required: ["poste", "categorie", "description", "quantite", "unite", "hypotheses"],
        additionalProperties: false,
      },
    },
    observations: {
      type: "string",
      description:
        "Observations générales : échelle, cotes manquantes, points d'attention.",
    },
  },
  required: ["projet", "ouvrages", "observations"],
  additionalProperties: false,
};

const SCHEMA_OUBLIS = {
  type: "object",
  properties: {
    oublis: {
      type: "array",
      items: {
        type: "object",
        properties: {
          poste: { type: "string" },
          gravite: {
            type: "string",
            enum: ["haute", "moyenne", "basse"],
          },
          justification: {
            type: "string",
            description:
              "Pourquoi ce poste est probablement manquant ou à vérifier.",
          },
        },
        required: ["poste", "gravite", "justification"],
        additionalProperties: false,
      },
    },
    syntheseControle: { type: "string" },
  },
  required: ["oublis", "syntheseControle"],
  additionalProperties: false,
};

/**
 * Étape 1 — Analyse les plans et extrait les ouvrages avec quantités.
 */
export async function analyserPlans(fichiers) {
  const blocsFichiers = construireBlocsFichiers(fichiers);

  const consigne = `Tu es un métreur-économiste spécialisé en génie civil.
Analyse les plans fournis et établis un métré de première approche.

Pour chaque ouvrage identifiable :
- classe-le dans l'une des catégories normalisées du bordereau,
- estime une quantité dans l'unité adaptée à partir des cotes et de l'échelle lisibles,
- explicite tes hypothèses de calcul (dimensions retenues, ratios usuels, incertitudes).

Sois exhaustif mais honnête : n'invente pas de cotes. Si une donnée manque,
retiens une hypothèse raisonnable et signale-la. Réponds en français.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { format: { type: "json_schema", schema: SCHEMA_EXTRACTION } },
    messages: [
      {
        role: "user",
        content: [...blocsFichiers, { type: "text", text: consigne }],
      },
    ],
  });

  return extraireJson(response);
}

/**
 * Étape 3 — Contrôle les oublis à partir des ouvrages détectés et de la check-list.
 */
export async function verifierOublis(extraction) {
  const ouvragesResume = (extraction.ouvrages || [])
    .map((o) => `- ${o.poste} [${o.categorie}] : ${o.quantite} ${o.unite}`)
    .join("\n");

  const consigne = `Tu es un ingénieur en charge du contrôle d'une estimation de génie civil.

Projet : ${extraction.projet || "non précisé"}

Ouvrages déjà chiffrés :
${ouvragesResume || "(aucun)"}

Check-list de référence des postes fréquemment oubliés :
${CHECKLIST_OUBLIS.map((c) => `- ${c}`).join("\n")}

Compare les ouvrages chiffrés à cette check-list et au bon sens métier.
Liste uniquement les postes réellement manquants ou à vérifier pour ce projet,
avec une gravité (haute/moyenne/basse) et une justification concise.
N'inclus pas les postes déjà correctement pris en compte. Réponds en français.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { format: { type: "json_schema", schema: SCHEMA_OUBLIS } },
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
