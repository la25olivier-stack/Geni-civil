import express from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { analyserPlans, verifierOublis } from "./src/estimator.js";
import { chiffrer } from "./src/pricing.js";
import { classerDocument, rechercher } from "./src/documents.js";
import {
  comparerOffres,
  conseiller,
  construireBonDeCommande,
} from "./src/achats.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

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

app.get("/api/sante", (_req, res) => {
  res.json({ statut: "ok", cleConfiguree: Boolean(process.env.ANTHROPIC_API_KEY) });
});

// ---------------------------------------------------------------------------
// Agent Estimateur — analyse des plans -> chiffrage -> vérification des oublis
// ---------------------------------------------------------------------------

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
        err?.message || "Une erreur est survenue lors de l'analyse des plans.",
    });
  }
});

// ---------------------------------------------------------------------------
// Agent Gestion documentaire — classement automatique + moteur de recherche
// ---------------------------------------------------------------------------

// Fonds documentaire en mémoire (réinitialisé au redémarrage du serveur).
// Dans un déploiement réel, à remplacer par une base de données persistante.
const documents = [];

app.post("/api/documents/classer", upload.array("fichiers"), async (req, res) => {
  try {
    const texte = req.body?.texte;
    const fichiersBruts = req.files || [];

    if (fichiersBruts.length === 0 && !(texte && texte.trim())) {
      return res
        .status(400)
        .json({ erreur: "Fournissez un fichier ou un texte à classer." });
    }

    const invalide = fichiersBruts.find((f) => !MEDIA_AUTORISES.has(f.mimetype));
    if (invalide) {
      return res.status(400).json({
        erreur: `Format non supporté : ${invalide.mimetype}. Utilisez PNG, JPEG, WEBP ou PDF.`,
      });
    }

    const fichiers = fichiersBruts.map((f) => ({
      mediaType: f.mimetype,
      data: f.buffer.toString("base64"),
    }));
    const nomFichier = fichiersBruts.map((f) => f.originalname).join(", ");

    const classement = await classerDocument({ fichiers, texte, nomFichier });

    const document = {
      id: randomUUID(),
      nomFichier: nomFichier || null,
      archiveLe: new Date().toISOString(),
      ...classement,
    };
    documents.push(document);

    res.json({ document, total: documents.length });
  } catch (err) {
    console.error("Erreur classement:", err);
    res.status(500).json({
      erreur: err?.message || "Une erreur est survenue lors du classement.",
    });
  }
});

app.get("/api/documents", (_req, res) => {
  res.json({ documents, total: documents.length });
});

app.delete("/api/documents/:id", (req, res) => {
  const index = documents.findIndex((d) => d.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ erreur: "Document introuvable." });
  }
  documents.splice(index, 1);
  res.json({ total: documents.length });
});

app.post("/api/documents/rechercher", async (req, res) => {
  try {
    const requete = req.body?.requete;
    if (!requete || !requete.trim()) {
      return res.status(400).json({ erreur: "Requête de recherche vide." });
    }

    const recherche = await rechercher(requete, documents);

    // Rattache chaque résultat au document complet pour l'affichage.
    const resultats = (recherche.resultats || [])
      .map((r) => {
        const doc = documents.find((d) => d.id === r.id);
        return doc ? { ...r, document: doc } : null;
      })
      .filter(Boolean);

    res.json({ synthese: recherche.synthese, resultats });
  } catch (err) {
    console.error("Erreur recherche:", err);
    res.status(500).json({
      erreur: err?.message || "Une erreur est survenue lors de la recherche.",
    });
  }
});

// ---------------------------------------------------------------------------
// Agent Achats — comparaison des offres, économies et bon de commande
// ---------------------------------------------------------------------------

app.post("/api/achats/analyser", async (req, res) => {
  try {
    const { besoin, offres } = req.body || {};

    if (!Array.isArray(offres) || offres.length === 0) {
      return res
        .status(400)
        .json({ erreur: "Fournissez au moins une offre fournisseur." });
    }
    const offreVide = offres.find(
      (o) => !Array.isArray(o.articles) || o.articles.length === 0
    );
    if (offreVide) {
      return res.status(400).json({
        erreur: "Chaque fournisseur doit proposer au moins un article.",
      });
    }

    // 1. Comparaison chiffrée déterministe
    const comparaison = comparerOffres(offres);

    // 2. Conseil (stratégie, économies, risques) via l'IA
    const conseil = await conseiller(comparaison, besoin);

    // 3. Bon de commande déterministe selon la stratégie retenue
    const bonDeCommande = construireBonDeCommande(
      comparaison,
      conseil.recommandation
    );

    res.json({ comparaison, conseil, bonDeCommande });
  } catch (err) {
    console.error("Erreur achats:", err);
    res.status(500).json({
      erreur:
        err?.message || "Une erreur est survenue lors de l'analyse des achats.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Estimateur IA génie civil démarré sur http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "⚠️  ANTHROPIC_API_KEY n'est pas défini. Les appels au modèle échoueront tant que la clé n'est pas configurée."
    );
  }
});
