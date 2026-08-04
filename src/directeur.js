import Anthropic from "@anthropic-ai/sdk";
import { tableauDeBord } from "./data.js";

// Le Directeur général IA coordonne la vision d'ensemble de l'entreprise.
// Il s'appuie sur le tableau de bord DÉTERMINISTE (data.js) : les KPI, marges,
// risques et rentabilités lui sont fournis calculés. Son rôle est d'analyser,
// de synthétiser, de hiérarchiser les problèmes et de proposer des décisions.

const MODEL = process.env.DIRECTEUR_MODEL || "claude-opus-5";

const client = new Anthropic();

/**
 * Rôle système commun à toutes les interactions avec le Directeur général IA.
 */
function consigneRole(tdb) {
  return `Tu es le Directeur général IA d'une PME de génie civil. Tu coordonnes la
vision d'ensemble de l'entreprise et tu conseilles la direction.

Tu raisonnes UNIQUEMENT à partir du tableau de bord fourni ci-dessous, dont les
chiffres (chiffre d'affaires, marges, risques, rentabilité par client) ont été
calculés de façon fiable. N'invente aucun chiffre : cite ceux du tableau de bord.
Quand tu avances un montant, rattache-le au projet ou au client concerné.

Sois direct, factuel et orienté décision, comme un dirigeant qui prépare un
comité. Exprime les montants en euros. Réponds en français.

Tableau de bord de l'entreprise (exercice ${tdb.exercice}) :
${JSON.stringify(tdb, null, 2)}`;
}

const SCHEMA_RAPPORT = {
  type: "object",
  properties: {
    periode: { type: "string", description: "Période couverte par le rapport." },
    syntheseExecutive: {
      type: "string",
      description: "Synthèse de 3 à 5 phrases à destination de la direction.",
    },
    kpis: {
      type: "array",
      description: "Indicateurs clés à mettre en avant.",
      items: {
        type: "object",
        properties: {
          libelle: { type: "string" },
          valeur: { type: "string", description: "Valeur formatée (ex : 12,3 M€)." },
          tendance: { type: "string", enum: ["hausse", "stable", "baisse", "alerte"] },
          commentaire: { type: "string" },
        },
        required: ["libelle", "valeur", "tendance", "commentaire"],
        additionalProperties: false,
      },
    },
    problemesPrioritaires: {
      type: "array",
      description: "Problèmes à traiter en priorité, du plus grave au moins grave.",
      items: {
        type: "object",
        properties: {
          titre: { type: "string" },
          gravite: { type: "string", enum: ["haute", "moyenne", "basse"] },
          impact: { type: "string", description: "Impact business chiffré si possible." },
          projetsConcernes: { type: "array", items: { type: "string" } },
        },
        required: ["titre", "gravite", "impact", "projetsConcernes"],
        additionalProperties: false,
      },
    },
    risquesMajeurs: {
      type: "array",
      description: "Principaux risques de la période.",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          projet: { type: "string" },
          gravite: { type: "string", enum: ["haute", "moyenne", "basse"] },
          actionRecommandee: { type: "string" },
        },
        required: ["description", "projet", "gravite", "actionRecommandee"],
        additionalProperties: false,
      },
    },
    decisions: {
      type: "array",
      description: "Décisions proposées à la direction, fondées sur les données.",
      items: {
        type: "object",
        properties: {
          decision: { type: "string" },
          justification: { type: "string" },
          urgence: { type: "string", enum: ["immediate", "semaine", "mois"] },
        },
        required: ["decision", "justification", "urgence"],
        additionalProperties: false,
      },
    },
    conclusion: { type: "string" },
  },
  required: [
    "periode",
    "syntheseExecutive",
    "kpis",
    "problemesPrioritaires",
    "risquesMajeurs",
    "decisions",
    "conclusion",
  ],
  additionalProperties: false,
};

const SCHEMA_REPONSE = {
  type: "object",
  properties: {
    reponse: {
      type: "string",
      description: "Réponse directe et argumentée à la question posée.",
    },
    pointsCles: {
      type: "array",
      description: "Points clés à retenir, sous forme de puces.",
      items: { type: "string" },
    },
    donneesAppui: {
      type: "array",
      description: "Chiffres du tableau de bord qui appuient la réponse.",
      items: {
        type: "object",
        properties: {
          libelle: { type: "string" },
          valeur: { type: "string" },
        },
        required: ["libelle", "valeur"],
        additionalProperties: false,
      },
    },
    recommandations: {
      type: "array",
      description: "Actions ou décisions recommandées.",
      items: { type: "string" },
    },
  },
  required: ["reponse", "pointsCles", "donneesAppui", "recommandations"],
  additionalProperties: false,
};

/**
 * Produit un rapport de direction pour la période demandée.
 * @param {"quotidien"|"hebdomadaire"} periode
 */
export async function produireRapport(periode = "quotidien") {
  const tdb = tableauDeBord();
  const libellePeriode =
    periode === "hebdomadaire" ? "de la semaine écoulée" : "de la journée";
  const focus =
    periode === "hebdomadaire"
      ? `Adopte une vision hebdomadaire : tendances, avancement des chantiers,
carnet de commandes, rentabilité par client et pilotage des risques sur la semaine.`
      : `Adopte une vision quotidienne : points chauds du jour, projets déficitaires,
risques élevés à traiter aujourd'hui et décisions immédiates.`;

  const consigne = `${consigneRole(tdb)}

Rédige le rapport de direction ${libellePeriode}.
${focus}

Hiérarchise les problèmes prioritaires et propose des décisions concrètes,
chacune justifiée par les données du tableau de bord.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { format: { type: "json_schema", schema: SCHEMA_RAPPORT } },
    messages: [{ role: "user", content: consigne }],
  });

  return { periode, kpi: tdb.kpi, rapport: extraireJson(response) };
}

/**
 * Répond à une question libre de la direction.
 * @param {string} question
 */
export async function repondreQuestion(question) {
  if (!question || !question.trim()) {
    throw new Error("La question est vide.");
  }
  const tdb = tableauDeBord();

  const consigne = `${consigneRole(tdb)}

Question de la direction : « ${question.trim()} »

Réponds précisément à cette question en t'appuyant sur les données du tableau de
bord. Cite les projets, clients et montants concernés. Si la donnée nécessaire
n'est pas disponible, dis-le clairement plutôt que d'inventer.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    output_config: { format: { type: "json_schema", schema: SCHEMA_REPONSE } },
    messages: [{ role: "user", content: consigne }],
  });

  return { question: question.trim(), reponse: extraireJson(response) };
}

function extraireJson(response) {
  if (response.stop_reason === "refusal") {
    throw new Error("La demande a été refusée par le modèle.");
  }
  const bloc = response.content.find((b) => b.type === "text");
  if (!bloc) throw new Error("Réponse du modèle vide.");
  return JSON.parse(bloc.text);
}
