import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { analyserPlans, verifierOublis } from "./src/estimator.js";
import { chiffrer, CATALOGUE, PARAMETRES } from "./src/pricing.js";
import { enregistrer, lister, recuperer, supprimer } from "./src/historique.js";

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

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/sante", (_req, res) => {
  res.json({ statut: "ok", cleConfiguree: Boolean(process.env.ANTHROPIC_API_KEY) });
});

// Bordereau de prix unitaires (pour l'édition des prix côté client).
app.get("/api/bordereau", (_req, res) => {
  res.json({ catalogue: CATALOGUE, parametres: PARAMETRES });
});

// --- Historique des projets ------------------------------------------------

app.get("/api/historique", async (_req, res) => {
  try {
    res.json(await lister());
  } catch (err) {
    console.error("Erreur historique (liste):", err);
    res.status(500).json({ erreur: "Impossible de lire l'historique." });
  }
});

app.get("/api/historique/:id", async (req, res) => {
  try {
    const projet = await recuperer(req.params.id);
    if (!projet) return res.status(404).json({ erreur: "Projet introuvable." });
    res.json(projet);
  } catch (err) {
    console.error("Erreur historique (lecture):", err);
    res.status(500).json({ erreur: "Impossible de lire le projet." });
  }
});

app.post("/api/historique", async (req, res) => {
  try {
    const { nom, extraction, estimation, controle } = req.body || {};
    if (!estimation) {
      return res.status(400).json({ erreur: "Estimation manquante." });
    }
    const entree = await enregistrer({ nom, extraction, estimation, controle });
    res.status(201).json(entree);
  } catch (err) {
    console.error("Erreur historique (enregistrement):", err);
    res.status(500).json({ erreur: "Impossible d'enregistrer le projet." });
  }
});

app.delete("/api/historique/:id", async (req, res) => {
  try {
    const ok = await supprimer(req.params.id);
    if (!ok) return res.status(404).json({ erreur: "Projet introuvable." });
    res.status(204).end();
  } catch (err) {
    console.error("Erreur historique (suppression):", err);
    res.status(500).json({ erreur: "Impossible de supprimer le projet." });
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
