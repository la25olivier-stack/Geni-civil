import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { analyserPlans, verifierOublis } from "./src/estimator.js";
import { chiffrer } from "./src/pricing.js";
import { TOUS_AGENTS, trouverAgent } from "./src/agents/definitions.js";
import {
  executerAgent,
  orchestrer,
  verifierProvider,
} from "./src/agents/runtime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

const MEDIA_AUTORISES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "1mb" }));

app.get("/api/sante", (_req, res) => {
  res.json({ statut: "ok", cleConfiguree: Boolean(process.env.ANTHROPIC_API_KEY) });
});

// --- Agents IA -------------------------------------------------------------

/** État du fournisseur d'IA (Ollama local gratuit ou Claude). */
app.get("/api/agents/statut", async (_req, res) => {
  try {
    res.json(await verifierProvider());
  } catch (err) {
    res.status(500).json({ erreur: err?.message || "Statut indisponible." });
  }
});

/** Métadonnées des agents (sans les prompts), pour l'organigramme et l'UI. */
app.get("/api/agents", (_req, res) => {
  const agents = TOUS_AGENTS.map((a) => ({
    id: a.id,
    nom: a.nom,
    emoji: a.emoji,
    priorite: a.priorite,
    rattachement: a.rattachement,
    mission: a.mission,
    sources: a.sources,
    competences: a.competences,
    exemples: a.exemples,
  }));
  res.json({ agents });
});

/** Interroge un agent précis (le DG passe par l'orchestrateur). */
app.post("/api/agents/:id", async (req, res) => {
  const { id } = req.params;
  const { question, contexte } = req.body || {};
  if (!trouverAgent(id)) {
    return res.status(404).json({ erreur: `Agent inconnu : ${id}` });
  }
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ erreur: "La question est requise." });
  }
  try {
    const reponse = await executerAgent(id, question.trim(), contexte || "");
    res.json(reponse);
  } catch (err) {
    console.error(`Erreur agent ${id} :`, err);
    res.status(500).json({ erreur: err?.message || "Erreur de l'agent." });
  }
});

/** Interroge directement le Directeur général (orchestration multi-agents). */
app.post("/api/dg", async (req, res) => {
  const { question, contexte } = req.body || {};
  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ erreur: "La question est requise." });
  }
  try {
    const reponse = await orchestrer(question.trim(), contexte || "");
    res.json(reponse);
  } catch (err) {
    console.error("Erreur orchestration DG :", err);
    res.status(500).json({ erreur: err?.message || "Erreur du Directeur général." });
  }
});

/**
 * Pipeline complet : analyse des plans -> chiffrage -> vérification des oublis.
 */
app.post("/api/estimation", upload.array("plans"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ erreur: "Aucun plan fourni." });
    }

    const invalide = req.files.find((f) => !MEDIA_AUTORISES.has(f.mimetype));
    if (invalide) {
      return res.status(400).json({
        erreur: `Format non supporté : ${invalide.mimetype}. Utilisez PNG, JPEG, WEBP ou PDF.`,
      });
    }

    const fichiers = req.files.map((f) => ({
      mediaType: f.mimetype,
      data: f.buffer.toString("base64"),
    }));

    // 1. Analyse des plans (vision) + extraction des ouvrages
    const extraction = await analyserPlans(fichiers);

    // 2. Chiffrage déterministe à partir du bordereau
    const estimation = chiffrer(extraction.ouvrages);

    // 3. Contrôle des oublis
    const controle = await verifierOublis(extraction);

    res.json({ extraction, estimation, controle });
  } catch (err) {
    console.error("Erreur estimation:", err);
    res.status(500).json({
      erreur:
        err?.message ||
        "Une erreur est survenue lors de l'analyse des plans.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Estimateur IA génie civil démarré sur http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "⚠️  ANTHROPIC_API_KEY n'est pas défini. L'analyse des plans échouera tant que la clé n'est pas configurée."
    );
  }
});
