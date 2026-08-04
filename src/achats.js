import Anthropic from "@anthropic-ai/sdk";

// Agent Achats.
// Compare les offres fournisseurs, prépare les bons de commande, suit les
// délais de livraison, compare les prix et suggère des économies.
//
// La comparaison chiffrée est déterministe (comme le bordereau de l'estimateur) ;
// Claude apporte le jugement : stratégie d'achat, leviers d'économies et risques.

const MODEL = process.env.ACHATS_MODEL || "claude-opus-5";

const client = new Anthropic();

function round2(n) {
  return Math.round(n * 100) / 100;
}

function normaliser(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compare les offres fournisseurs de façon déterministe.
 *
 * @param {Array<{fournisseur:string, delaiLivraisonJours?:number,
 *   articles:Array<{designation:string, quantite:number, unite?:string,
 *   prixUnitaire:number, delaiLivraisonJours?:number}>}>} offres
 * @returns {object} comparaison chiffrée
 */
export function comparerOffres(offres) {
  const liste = Array.isArray(offres) ? offres : [];

  const fournisseurs = liste.map((o) => {
    const lignes = (o.articles || []).map((a) => {
      const quantite = Number.isFinite(a.quantite) ? a.quantite : 0;
      const prixUnitaire = Number.isFinite(a.prixUnitaire) ? a.prixUnitaire : 0;
      const delai = Number.isFinite(a.delaiLivraisonJours)
        ? a.delaiLivraisonJours
        : Number.isFinite(o.delaiLivraisonJours)
          ? o.delaiLivraisonJours
          : null;
      return {
        designation: a.designation || "",
        cle: normaliser(a.designation),
        quantite,
        unite: a.unite || "u",
        prixUnitaire,
        montant: round2(quantite * prixUnitaire),
        delaiLivraisonJours: delai,
      };
    });
    const total = round2(lignes.reduce((s, l) => s + l.montant, 0));
    const delais = lignes
      .map((l) => l.delaiLivraisonJours)
      .filter((d) => Number.isFinite(d));
    const delaiMax = delais.length ? Math.max(...delais) : null;
    return {
      fournisseur: o.fournisseur || "Fournisseur",
      lignes,
      total,
      delaiMax,
      nbArticles: lignes.length,
    };
  });

  // Meilleur prix par article (panier optimisé, tous fournisseurs confondus).
  const parArticle = new Map();
  fournisseurs.forEach((f) => {
    f.lignes.forEach((l) => {
      if (!l.cle) return;
      const entree = parArticle.get(l.cle) || {
        designation: l.designation,
        quantite: l.quantite,
        unite: l.unite,
        offres: [],
      };
      entree.offres.push({
        fournisseur: f.fournisseur,
        prixUnitaire: l.prixUnitaire,
        montant: l.montant,
        delaiLivraisonJours: l.delaiLivraisonJours,
      });
      // Retient la quantité la plus élevée demandée pour l'article.
      entree.quantite = Math.max(entree.quantite, l.quantite);
      parArticle.set(l.cle, entree);
    });
  });

  const articles = [...parArticle.values()].map((e) => {
    const valides = e.offres.filter((o) => o.prixUnitaire > 0);
    const reference = valides.length ? valides : e.offres;
    const meilleure = reference.reduce(
      (best, o) => (best === null || o.prixUnitaire < best.prixUnitaire ? o : best),
      null
    );
    return {
      designation: e.designation,
      quantite: e.quantite,
      unite: e.unite,
      meilleurFournisseur: meilleure ? meilleure.fournisseur : null,
      meilleurPrixUnitaire: meilleure ? meilleure.prixUnitaire : null,
      meilleurDelaiLivraisonJours: meilleure ? meilleure.delaiLivraisonJours : null,
      montantOptimise: meilleure ? round2(e.quantite * meilleure.prixUnitaire) : 0,
      offres: e.offres,
    };
  });

  const panierOptimise = {
    lignes: articles.map((a) => ({
      designation: a.designation,
      quantite: a.quantite,
      unite: a.unite,
      fournisseur: a.meilleurFournisseur,
      prixUnitaire: a.meilleurPrixUnitaire,
      montant: a.montantOptimise,
      delaiLivraisonJours: a.meilleurDelaiLivraisonJours,
    })),
    total: round2(articles.reduce((s, a) => s + a.montantOptimise, 0)),
  };

  // Fournisseur unique le moins-disant (parmi ceux qui offrent le plus d'articles).
  const maxArticles = fournisseurs.reduce((m, f) => Math.max(m, f.nbArticles), 0);
  const complets = fournisseurs.filter((f) => f.nbArticles === maxArticles);
  const moinsDisant = complets.reduce(
    (best, f) => (best === null || f.total < best.total ? f : best),
    null
  );

  const economiePotentielle = moinsDisant
    ? round2(moinsDisant.total - panierOptimise.total)
    : 0;

  return {
    fournisseurs,
    articles,
    panierOptimise,
    moinsDisant: moinsDisant
      ? { fournisseur: moinsDisant.fournisseur, total: moinsDisant.total }
      : null,
    economiePotentielle,
  };
}

const SCHEMA_CONSEIL = {
  type: "object",
  properties: {
    recommandation: {
      type: "object",
      properties: {
        strategie: {
          type: "string",
          enum: ["fournisseur_unique", "panier_optimise", "mixte"],
          description:
            "Stratégie retenue : un seul fournisseur, panier optimisé multi-fournisseurs, ou approche mixte.",
        },
        fournisseur: {
          type: "string",
          description:
            "Fournisseur retenu si stratégie 'fournisseur_unique' (sinon chaîne vide).",
        },
        justification: {
          type: "string",
          description:
            "Justification équilibrant prix, délais de livraison et fiabilité.",
        },
      },
      required: ["strategie", "fournisseur", "justification"],
      additionalProperties: false,
    },
    economies: {
      type: "array",
      description: "Leviers d'économies actionnables.",
      items: {
        type: "object",
        properties: {
          levier: { type: "string" },
          description: { type: "string" },
          gainEstime: {
            type: ["number", "null"],
            description: "Gain estimé en euros (null si non chiffrable).",
          },
        },
        required: ["levier", "description", "gainEstime"],
        additionalProperties: false,
      },
    },
    risques: {
      type: "array",
      items: { type: "string" },
      description: "Risques sur les délais, la qualité ou l'approvisionnement.",
    },
    conditions: {
      type: "string",
      description:
        "Conditions à négocier / mentionner sur le bon de commande (paiement, livraison, garanties).",
    },
  },
  required: ["recommandation", "economies", "risques", "conditions"],
  additionalProperties: false,
};

/**
 * Analyse qualitative : stratégie d'achat, économies, risques, conditions.
 *
 * @param {object} comparaison résultat de comparerOffres
 * @param {string} [besoin] description du besoin
 * @returns {Promise<object>}
 */
export async function conseiller(comparaison, besoin) {
  const resumeFournisseurs = (comparaison.fournisseurs || [])
    .map(
      (f) =>
        `- ${f.fournisseur} : total ${f.total} € sur ${f.nbArticles} article(s), ` +
        `délai max ${f.delaiMax != null ? f.delaiMax + " j" : "n.c."}`
    )
    .join("\n");

  const resumeArticles = (comparaison.articles || [])
    .map(
      (a) =>
        `- ${a.designation} (${a.quantite} ${a.unite}) : meilleur prix ` +
        `${a.meilleurPrixUnitaire ?? "n.c."} €/u chez ${a.meilleurFournisseur || "n.c."}`
    )
    .join("\n");

  const consigne = `Tu es le responsable achats d'une entreprise de génie civil.

Besoin : ${besoin && besoin.trim() ? besoin.trim() : "non précisé"}

Offres fournisseurs (totaux calculés) :
${resumeFournisseurs || "(aucune)"}

Meilleur prix par article :
${resumeArticles || "(aucun)"}

Fournisseur unique le moins-disant : ${
    comparaison.moinsDisant
      ? `${comparaison.moinsDisant.fournisseur} (${comparaison.moinsDisant.total} €)`
      : "n.c."
  }
Total du panier optimisé (meilleur prix par article) : ${comparaison.panierOptimise?.total ?? "n.c."} €
Économie potentielle du panier optimisé vs moins-disant : ${comparaison.economiePotentielle} €

Recommande une stratégie d'achat en arbitrant entre le prix, les délais de
livraison et la fiabilité (un panier éclaté sur trop de fournisseurs complexifie
la logistique). Propose des leviers d'économies concrets (négociation, groupement
de commandes, substitution d'articles, quantités) et signale les risques. Réponds
en français.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema: SCHEMA_CONSEIL } },
    messages: [{ role: "user", content: consigne }],
  });

  return extraireJson(response);
}

/**
 * Construit un bon de commande déterministe à partir de la stratégie retenue.
 *
 * @param {object} comparaison résultat de comparerOffres
 * @param {object} recommandation recommandation issue de conseiller()
 * @returns {object} bon de commande chiffré
 */
export function construireBonDeCommande(comparaison, recommandation) {
  const strategie = recommandation?.strategie || "panier_optimise";

  let fournisseur;
  let lignes;

  if (strategie === "fournisseur_unique" && recommandation?.fournisseur) {
    const cible = comparaison.fournisseurs.find(
      (f) => normaliser(f.fournisseur) === normaliser(recommandation.fournisseur)
    );
    if (cible) {
      fournisseur = cible.fournisseur;
      lignes = cible.lignes.map((l) => ({
        designation: l.designation,
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaire: l.prixUnitaire,
        montant: l.montant,
        delaiLivraisonJours: l.delaiLivraisonJours,
      }));
    }
  }

  // Par défaut (panier optimisé ou mixte) : meilleur prix par article.
  if (!lignes) {
    fournisseur =
      strategie === "fournisseur_unique" && recommandation?.fournisseur
        ? recommandation.fournisseur
        : "Multi-fournisseurs (panier optimisé)";
    lignes = (comparaison.panierOptimise?.lignes || []).map((l) => ({
      designation: l.designation,
      quantite: l.quantite,
      unite: l.unite,
      prixUnitaire: l.prixUnitaire,
      montant: l.montant,
      fournisseur: l.fournisseur,
      delaiLivraisonJours: l.delaiLivraisonJours,
    }));
  }

  const totalHT = round2(lignes.reduce((s, l) => s + (l.montant || 0), 0));
  const delais = (lignes || [])
    .map((l) => l.delaiLivraisonJours)
    .filter((d) => Number.isFinite(d));
  const delaiLivraison = delais.length ? `${Math.max(...delais)} jours` : "à confirmer";

  return {
    reference: `BC-${new Date().toISOString().slice(0, 10)}-${Math.floor(
      (Date.now() % 100000) / 1
    )
      .toString()
      .padStart(5, "0")}`,
    fournisseur,
    strategie,
    lignes,
    totalHT,
    delaiLivraison,
    conditions: recommandation?.conditions || "",
  };
}
