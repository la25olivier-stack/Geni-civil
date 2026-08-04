// Couche d'abstraction du fournisseur d'IA pour les agents.
//
// Deux fournisseurs sont supportés :
//   - "ollama"    : modèle gratuit qui tourne en local (aucune clé, aucun coût).
//   - "anthropic" : modèle Claude (nécessite ANTHROPIC_API_KEY, payant).
//
// Le choix se fait via AGENTS_PROVIDER. Par défaut : "anthropic" si une clé est
// présente, sinon "ollama". Ainsi, sans clé API, les agents utilisent Ollama.
//
// Le reste du code (runtime.js) ne connaît que deux primitives normalisées :
//   - analyseStructuree() : renvoie un objet JSON conforme à un schéma.
//   - tourConversation()  : un tour de dialogue avec appel d'outils éventuel.

import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_MODEL =
  process.env.AGENTS_MODEL || process.env.ESTIMATEUR_MODEL || "claude-opus-5";
const OLLAMA_HOST = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 120000);

const PROVIDER = choisirProvider();

let _anthropic = null;
function anthropic() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

let _compteurOutil = 0;

function choisirProvider() {
  const p = (process.env.AGENTS_PROVIDER || "").toLowerCase();
  if (p === "ollama" || p === "anthropic") return p;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "ollama";
}

/** Renseigne l'interface sur le fournisseur actif. */
export function infoProvider() {
  return PROVIDER === "ollama"
    ? { provider: "ollama", modele: OLLAMA_MODEL, hote: OLLAMA_HOST }
    : { provider: "anthropic", modele: ANTHROPIC_MODEL };
}

/**
 * Vérifie que le fournisseur est prêt à répondre.
 * @returns {Promise<{provider:string, modele:string, pret:boolean, message:string}>}
 */
export async function verifierProvider() {
  if (PROVIDER === "anthropic") {
    const pret = Boolean(process.env.ANTHROPIC_API_KEY);
    return {
      provider: "anthropic",
      modele: ANTHROPIC_MODEL,
      pret,
      message: pret
        ? `Claude prêt (${ANTHROPIC_MODEL}).`
        : "ANTHROPIC_API_KEY manquante.",
    };
  }

  // Ollama : on interroge /api/tags pour vérifier qu'il tourne et que le modèle
  // est installé.
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const modeles = (data.models || []).map((m) => m.name);
    const present = modeles.some(
      (n) => n === OLLAMA_MODEL || n.startsWith(`${OLLAMA_MODEL}:`)
    );
    return {
      provider: "ollama",
      modele: OLLAMA_MODEL,
      hote: OLLAMA_HOST,
      pret: present,
      message: present
        ? `Ollama prêt (${OLLAMA_MODEL}).`
        : `Ollama tourne mais le modèle « ${OLLAMA_MODEL} » n'est pas installé. Lancez : ollama pull ${OLLAMA_MODEL}`,
    };
  } catch (err) {
    return {
      provider: "ollama",
      modele: OLLAMA_MODEL,
      hote: OLLAMA_HOST,
      pret: false,
      message: `Ollama n'est pas accessible sur ${OLLAMA_HOST}. Installez-le (ollama.com), puis lancez « ollama serve » et « ollama pull ${OLLAMA_MODEL} ».`,
    };
  }
}

/**
 * Demande une réponse structurée conforme à un schéma JSON.
 * @param {{system:string, content:string, schema:object, maxTokens?:number}} p
 * @returns {Promise<object>}
 */
export async function analyseStructuree({ system, content, schema, maxTokens = 4000 }) {
  if (PROVIDER === "ollama") {
    const message = await ollamaChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      format: schema,
      maxTokens,
    });
    return parserJson(message.content);
  }

  const response = await anthropic().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("La demande a été refusée par le modèle.");
  }
  const bloc = response.content.find((b) => b.type === "text");
  if (!bloc) throw new Error("Réponse du modèle vide.");
  return parserJson(bloc.text);
}

/**
 * Un tour de conversation avec outils éventuels.
 * @param {{system:string, messages:Array, tools:Array, maxTokens?:number}} p
 *   messages : format normalisé
 *     - { role:"user", content:string }
 *     - { role:"assistant", text:string, toolCalls:[{id,name,input}] }
 *     - { role:"outils", resultats:[{id,name,contenu,erreur?}] }
 *   tools : [{ name, description, schema }]
 * @returns {Promise<{text:string, toolCalls:Array<{id,name,input}>, stopReason:"tool_use"|"end"}>}
 */
export async function tourConversation({ system, messages, tools, maxTokens = 4000 }) {
  if (PROVIDER === "ollama") {
    return tourOllama({ system, messages, tools, maxTokens });
  }
  return tourAnthropic({ system, messages, tools, maxTokens });
}

// --- Implémentation Anthropic ----------------------------------------------

async function tourAnthropic({ system, messages, tools, maxTokens }) {
  const msgs = messages.map((m) => {
    if (m.role === "user") return { role: "user", content: m.content };
    if (m.role === "assistant") {
      const content = [];
      if (m.text) content.push({ type: "text", text: m.text });
      for (const tc of m.toolCalls || []) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
      return { role: "assistant", content };
    }
    // role "outils" -> tool_result dans un message user
    return {
      role: "user",
      content: m.resultats.map((r) => ({
        type: "tool_result",
        tool_use_id: r.id,
        content: r.contenu,
        ...(r.erreur ? { is_error: true } : {}),
      })),
    };
  });

  const response = await anthropic().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema,
    })),
    messages: msgs,
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const toolCalls = response.content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));

  return {
    text,
    toolCalls,
    stopReason: response.stop_reason === "tool_use" ? "tool_use" : "end",
  };
}

// --- Implémentation Ollama --------------------------------------------------

async function tourOllama({ system, messages, tools, maxTokens }) {
  const msgs = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      msgs.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      msgs.push({
        role: "assistant",
        content: m.text || "",
        tool_calls: (m.toolCalls || []).map((tc) => ({
          function: { name: tc.name, arguments: tc.input },
        })),
      });
    } else if (m.role === "outils") {
      for (const r of m.resultats) {
        msgs.push({ role: "tool", tool_name: r.name, content: r.contenu });
      }
    }
  }

  const message = await ollamaChat({
    messages: msgs,
    tools: tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.schema },
    })),
    maxTokens,
  });

  const toolCalls = (message.tool_calls || []).map((tc) => ({
    id: `call_${_compteurOutil++}`,
    name: tc.function.name,
    input:
      typeof tc.function.arguments === "string"
        ? parserJson(tc.function.arguments)
        : tc.function.arguments || {},
  }));

  return {
    text: (message.content || "").trim(),
    toolCalls,
    stopReason: toolCalls.length > 0 ? "tool_use" : "end",
  };
}

/** Appel bas niveau à l'API /api/chat d'Ollama (non streamé). */
async function ollamaChat({ messages, tools, format, maxTokens }) {
  const corps = {
    model: OLLAMA_MODEL,
    messages,
    stream: false,
    options: { temperature: 0.4, num_predict: maxTokens },
  };
  if (tools) corps.tools = tools;
  if (format) corps.format = format;

  let res;
  try {
    res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === "TimeoutError") {
      throw new Error(
        `Ollama a mis trop de temps à répondre (> ${Math.round(
          OLLAMA_TIMEOUT_MS / 1000
        )} s). Essayez un modèle plus léger (ex. OLLAMA_MODEL=llama3.2).`
      );
    }
    throw new Error(
      `Ollama n'est pas accessible sur ${OLLAMA_HOST}. Lancez « ollama serve » puis « ollama pull ${OLLAMA_MODEL} ».`
    );
  }

  if (!res.ok) {
    const texte = await res.text().catch(() => "");
    throw new Error(`Erreur Ollama (HTTP ${res.status}) : ${texte.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.message) throw new Error("Réponse Ollama inattendue (message absent).");
  return data.message;
}

// --- Utilitaires ------------------------------------------------------------

/** Parse un JSON en tolérant un éventuel texte autour (modèles locaux). */
function parserJson(txt) {
  const s = String(txt || "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const debut = s.indexOf("{");
    const fin = s.lastIndexOf("}");
    if (debut !== -1 && fin > debut) {
      return JSON.parse(s.slice(debut, fin + 1));
    }
    throw new Error("Réponse du modèle non exploitable (JSON invalide).");
  }
}
