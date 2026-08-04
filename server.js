import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { analyserPlans, verifierOublis } from "./src/estimator.js";
import { chiffrer } from "./src/pricing.js";
import { produireRapport, repondreQuestion } from "./src/directeur.js";
import { tableauDeBord } from "./src/data.js";

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

// --- Directeur général IA ---------------------------------------------------

/**
 * Tableau de bord déterministe (KPI, projets, risques, rentabilité clients).
 * Ne nécessite pas d'appel au modèle : sert de socle de données.
 */
app.get("/api/direction/tableau-de-bord", (_req, res) => {
  try {
    res.json(tableauDeBord());
  } catch (err) {
    console.error("Erreur tableau de bord:", err);
    res.status(500).json({ erreur: err?.message || "Erreur inattendue." });
  }
});

/**
 * Rapport de direction (quotidien ou hebdomadaire) produit par le Directeur général IA.
 */
app.post("/api/direction/rapport", async (req, res) => {
  try {
    const periode =
      req.body?.periode === "hebdomadaire" ? "hebdomadaire" : "quotidien";
    const resultat = await produireRapport(periode);
    res.json(resultat);
  } catch (err) {
    console.error("Erreur rapport direction:", err);
    res.status(500).json({
      erreur: err?.message || "Une erreur est survenue lors de la production du rapport.",
    });
  }
});

/**
 * Réponse à une question libre de la direction.
 */
app.post("/api/direction/question", async (req, res) => {
  try {
    const question = req.body?.question;
    if (!question || !String(question).trim()) {
      return res.status(400).json({ erreur: "Aucune question fournie." });
    }
    const resultat = await repondreQuestion(String(question));
    res.json(resultat);
  } catch (err) {
    console.error("Erreur question direction:", err);
    res.status(500).json({
      erreur: err?.message || "Une erreur est survenue lors du traitement de la question.",
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
