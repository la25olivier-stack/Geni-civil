import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { analyserPlans, verifierOublis } from "./src/estimator.js";
import { chiffrer } from "./src/pricing.js";
import {
  listerEquipements,
  obtenirEquipement,
  ajouterEquipement,
  modifierEquipement,
  supprimerEquipement,
  ajouterOperation,
  syntheseParc,
  planifierMaintenance,
  typesDisponibles,
  categoriesCoutDisponibles,
  amorcerParcExemple,
} from "./src/equipements.js";

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

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

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

// ---------------------------------------------------------------------------
// Agent 9 — Gestion des équipements (parc matériel)
// ---------------------------------------------------------------------------

// Pré-remplit le parc avec un jeu d'exemples au démarrage.
amorcerParcExemple();

// Référentiels (types d'équipements, catégories de coûts) pour alimenter l'UI.
app.get("/api/equipements/referentiels", (_req, res) => {
  res.json({ types: typesDisponibles(), categoriesCout: categoriesCoutDisponibles() });
});

// Liste du parc + synthèse agrégée.
app.get("/api/equipements", (_req, res) => {
  res.json({ equipements: listerEquipements(), synthese: syntheseParc() });
});

// Détail d'un équipement.
app.get("/api/equipements/:id", (req, res) => {
  const eq = obtenirEquipement(req.params.id);
  if (!eq) return res.status(404).json({ erreur: "Équipement introuvable." });
  res.json(eq);
});

// Ajout d'un équipement.
app.post("/api/equipements", (req, res) => {
  try {
    const eq = ajouterEquipement(req.body || {});
    res.status(201).json(eq);
  } catch (err) {
    res.status(400).json({ erreur: err?.message || "Données invalides." });
  }
});

// Mise à jour d'un équipement.
app.put("/api/equipements/:id", (req, res) => {
  const eq = modifierEquipement(req.params.id, req.body || {});
  if (!eq) return res.status(404).json({ erreur: "Équipement introuvable." });
  res.json(eq);
});

// Suppression d'un équipement.
app.delete("/api/equipements/:id", (req, res) => {
  const ok = supprimerEquipement(req.params.id);
  if (!ok) return res.status(404).json({ erreur: "Équipement introuvable." });
  res.json({ statut: "supprime" });
});

// Ajout d'une opération (entretien, réparation, inspection, plein de carburant…).
app.post("/api/equipements/:id/operations", (req, res) => {
  const eq = ajouterOperation(req.params.id, req.body || {});
  if (!eq) return res.status(404).json({ erreur: "Équipement introuvable." });
  res.status(201).json(eq);
});

// Agent IA — plan de maintenance priorisé pour l'ensemble du parc.
app.post("/api/equipements/plan", async (_req, res) => {
  try {
    const plan = await planifierMaintenance();
    res.json(plan);
  } catch (err) {
    console.error("Erreur plan équipements:", err);
    res.status(500).json({
      erreur: err?.message || "Une erreur est survenue lors de la génération du plan.",
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
