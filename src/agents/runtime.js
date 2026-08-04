import {
  AGENTS,
  DIRECTEUR_GENERAL,
  trouverAgent,
  promptSysteme,
} from "./definitions.js";
import { analyseStructuree, tourConversation } from "./llm.js";

export { infoProvider, verifierProvider } from "./llm.js";

// Nombre maximal d'aller-retours d'outils que le DG peut faire dans une session
// (garde-fou contre une boucle de consultation qui ne se termine pas).
const MAX_TOURS_ORCHESTRATION = 6;

// Schéma de réponse imposé aux agents spécialistes : garantit une sortie
// exploitable par l'interface (synthèse, analyse, alertes, recommandations).
const SCHEMA_REPONSE_AGENT = {
  type: "object",
  properties: {
    synthese: {
      type: "string",
      description: "Réponse directe en 1 à 3 phrases.",
    },
    analyse: {
      type: "string",
      description: "Analyse détaillée qui justifie la synthèse.",
    },
    pointsCles: {
      type: "array",
      items: { type: "string" },
      description: "Points clés / chiffres à retenir.",
    },
    alertes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          niveau: { type: "string", enum: ["haute", "moyenne", "basse"] },
          message: { type: "string" },
        },
        required: ["niveau", "message"],
        additionalProperties: false,
      },
      description: "Alertes ou risques identifiés.",
    },
    recommandations: {
      type: "array",
      items: { type: "string" },
      description: "Actions concrètes recommandées.",
    },
    donneesManquantes: {
      type: "array",
      items: { type: "string" },
      description: "Données ou sources qui manqueraient pour être précis.",
    },
  },
  required: ["synthese", "analyse"],
  additionalProperties: false,
};

/**
 * Exécute un agent spécialiste sur une question et renvoie une réponse
 * structurée (conforme à SCHEMA_REPONSE_AGENT).
 *
 * @param {string} agentId - identifiant de l'agent (ex. "directeur_financier").
 * @param {string} question - question posée à l'agent.
 * @param {string} [contexte] - contexte / données fournies par l'appelant.
 * @returns {Promise<object>} réponse structurée de l'agent.
 */
export async function executerAgent(agentId, question, contexte = "") {
  const agent = trouverAgent(agentId);
  if (!agent) throw new Error(`Agent inconnu : ${agentId}`);
  if (agent.id === "dg") {
    // Le DG s'exécute via l'orchestrateur, pas comme un agent simple.
    return orchestrer(question, contexte);
  }

  const contenu = contexte
    ? `Contexte fourni :\n${contexte}\n\nQuestion :\n${question}`
    : `Question :\n${question}`;

  const data = await analyseStructuree({
    system: promptSysteme(agent),
    content: contenu,
    schema: SCHEMA_REPONSE_AGENT,
  });

  return { agent: agentId, nom: agent.nom, ...data };
}

/**
 * Construit la liste des outils « consulter_<agent> » exposés au DG,
 * un par agent spécialiste.
 */
function outilsSpecialistes() {
  return AGENTS.map((a) => ({
    name: `consulter_${a.id}`,
    description: `Consulter ${a.nom}. Mission : ${a.mission} Sources : ${a.sources.join(", ")}.`,
    schema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: `Question précise à poser à ${a.nom}.`,
        },
        contexte: {
          type: "string",
          description: "Contexte utile (facultatif).",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  }));
}

/**
 * Orchestration par le Directeur général : il reçoit une question, consulte
 * les agents spécialistes pertinents via des outils, puis synthétise.
 *
 * @param {string} question - question de la direction.
 * @param {string} [contexte] - contexte / données fournies.
 * @returns {Promise<{agent:string, nom:string, reponse:string, consultations:Array}>}
 */
export async function orchestrer(question, contexte = "") {
  const tools = outilsSpecialistes();
  const consultations = [];

  const messages = [
    {
      role: "user",
      content: contexte
        ? `Contexte fourni :\n${contexte}\n\nQuestion de la direction :\n${question}`
        : `Question de la direction :\n${question}`,
    },
  ];

  let derniereReponseTexte = "";

  for (let tour = 0; tour < MAX_TOURS_ORCHESTRATION; tour++) {
    const resultat = await tourConversation({
      system: DIRECTEUR_GENERAL.prompt,
      messages,
      tools,
    });

    if (resultat.text) derniereReponseTexte = resultat.text;

    if (resultat.stopReason !== "tool_use" || resultat.toolCalls.length === 0) {
      // Le DG a produit sa synthèse finale.
      return {
        agent: "dg",
        nom: DIRECTEUR_GENERAL.nom,
        reponse: derniereReponseTexte,
        consultations,
      };
    }

    // Mémorise l'appel d'outils dans l'historique.
    messages.push({
      role: "assistant",
      text: resultat.text,
      toolCalls: resultat.toolCalls,
    });

    // Exécute chaque agent consulté et prépare les résultats d'outils.
    const resultats = await Promise.all(
      resultat.toolCalls.map(async (tc) => {
        const agentId = tc.name.replace(/^consulter_/, "");
        try {
          const rep = await executerAgent(
            agentId,
            tc.input.question,
            tc.input.contexte || contexte
          );
          consultations.push({
            agent: agentId,
            nom: rep.nom,
            question: tc.input.question,
            reponse: rep,
          });
          return { id: tc.id, name: tc.name, contenu: JSON.stringify(rep) };
        } catch (err) {
          return {
            id: tc.id,
            name: tc.name,
            contenu: `Erreur lors de la consultation de ${agentId} : ${err.message}`,
            erreur: true,
          };
        }
      })
    );

    messages.push({ role: "outils", resultats });
  }

  // Sécurité : trop de tours — on renvoie ce qu'on a.
  return {
    agent: "dg",
    nom: DIRECTEUR_GENERAL.nom,
    reponse:
      derniereReponseTexte ||
      "Le Directeur général n'a pas pu conclure après plusieurs consultations. Reformulez la question ou fournissez plus de contexte.",
    consultations,
  };
}
