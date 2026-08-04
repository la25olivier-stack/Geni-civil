// Source de données de l'entreprise pour le Directeur général IA.
//
// Dans une installation réelle, ces données proviendraient d'un ERP, d'un outil
// de gestion de projet ou d'un logiciel de comptabilité. Ici, un jeu de données
// de démonstration représentatif d'une PME de génie civil sert de base au
// tableau de bord et permet au Directeur général IA de raisonner sur des chiffres
// concrets (marges, risques, trésorerie, rentabilité par client).
//
// Toutes les fonctions de calcul (KPI, projets déficitaires, rentabilité client…)
// sont DÉTERMINISTES : l'IA s'appuie sur ces chiffres, elle ne les invente pas.

// Exercice de référence (année fiscale courante).
export const EXERCICE = 2026;

// Portefeuille de projets. Les montants sont en euros.
// - montantContrat : montant contractuel facturable au client (marché signé).
// - coutsEngages   : coûts réellement engagés à ce jour.
// - montantFacture : montant déjà facturé au client.
// - montantEncaisse: montant déjà encaissé (pour la trésorerie).
// - avancement     : avancement physique du chantier en pourcentage (0-100).
export const PROJETS = [
  {
    id: "PRJ-2026-014",
    nom: "Pont de la Vézère",
    client: "Département de la Corrèze",
    statut: "en_cours",
    montantContrat: 4200000,
    coutsEngages: 2650000,
    montantFacture: 2500000,
    montantEncaisse: 2100000,
    avancement: 55,
    dateDebut: "2026-01-15",
    dateFinPrevue: "2026-12-20",
    chefProjet: "N. Rousseau",
    risques: [
      {
        description:
          "Découverte d'un sol de fondation moins portant que prévu, appuis à reprendre.",
        gravite: "haute",
        probabilite: "elevee",
      },
      {
        description: "Retard de livraison des poutres précontraintes (fournisseur).",
        gravite: "moyenne",
        probabilite: "moyenne",
      },
    ],
  },
  {
    id: "PRJ-2026-021",
    nom: "Station d'épuration de Malemort",
    client: "Agglo de Brive",
    statut: "en_cours",
    montantContrat: 6800000,
    coutsEngages: 2750000,
    montantFacture: 3300000,
    montantEncaisse: 3000000,
    avancement: 48,
    dateDebut: "2026-02-01",
    dateFinPrevue: "2027-03-30",
    chefProjet: "S. Lefèvre",
    risques: [
      {
        description:
          "Évolution réglementaire sur le traitement de l'azote pouvant modifier le process.",
        gravite: "moyenne",
        probabilite: "faible",
      },
    ],
  },
  {
    id: "PRJ-2026-008",
    nom: "Réhabilitation collecteur EU centre-ville",
    client: "Ville de Tulle",
    statut: "en_cours",
    montantContrat: 1450000,
    coutsEngages: 1380000,
    montantFacture: 1100000,
    montantEncaisse: 900000,
    avancement: 78,
    dateDebut: "2025-11-10",
    dateFinPrevue: "2026-09-15",
    chefProjet: "K. Bianchi",
    risques: [
      {
        description:
          "Réseaux enterrés non répertoriés ralentissant fortement le terrassement.",
        gravite: "haute",
        probabilite: "elevee",
      },
      {
        description:
          "Pénalités de retard contractuelles si livraison après le 15/09.",
        gravite: "haute",
        probabilite: "moyenne",
      },
    ],
  },
  {
    id: "PRJ-2026-030",
    nom: "Parking silo Gare",
    client: "Groupe Immobilier Lascaux",
    statut: "en_cours",
    montantContrat: 3900000,
    coutsEngages: 700000,
    montantFacture: 850000,
    montantEncaisse: 850000,
    avancement: 22,
    dateDebut: "2026-05-05",
    dateFinPrevue: "2027-06-30",
    chefProjet: "N. Rousseau",
    risques: [
      {
        description: "Client privé au paiement historiquement lent (délai > 75 j).",
        gravite: "moyenne",
        probabilite: "elevee",
      },
    ],
  },
  {
    id: "PRJ-2026-003",
    nom: "Renforcement digue de l'Auvézère",
    client: "Syndicat mixte Auvézère",
    statut: "en_cours",
    montantContrat: 2200000,
    coutsEngages: 1120000,
    montantFacture: 1500000,
    montantEncaisse: 1500000,
    avancement: 60,
    dateDebut: "2026-01-05",
    dateFinPrevue: "2026-11-30",
    chefProjet: "S. Lefèvre",
    risques: [
      {
        description:
          "Crues saisonnières pouvant interrompre le chantier plusieurs semaines.",
        gravite: "moyenne",
        probabilite: "moyenne",
      },
    ],
  },
  {
    id: "PRJ-2026-019",
    nom: "Giratoire RD1089",
    client: "Département de la Corrèze",
    statut: "en_cours",
    montantContrat: 780000,
    coutsEngages: 470000,
    montantFacture: 600000,
    montantEncaisse: 600000,
    avancement: 70,
    dateDebut: "2026-03-20",
    dateFinPrevue: "2026-10-10",
    chefProjet: "K. Bianchi",
    risques: [],
  },
  {
    id: "PRJ-2025-047",
    nom: "Fondations halle industrielle",
    client: "Groupe Immobilier Lascaux",
    statut: "termine",
    montantContrat: 1650000,
    coutsEngages: 1720000,
    montantFacture: 1650000,
    montantEncaisse: 1650000,
    avancement: 100,
    dateDebut: "2025-09-01",
    dateFinPrevue: "2026-02-28",
    chefProjet: "N. Rousseau",
    risques: [],
  },
  {
    id: "PRJ-2026-025",
    nom: "Passerelle piétonne Parc",
    client: "Ville de Tulle",
    statut: "termine",
    montantContrat: 540000,
    coutsEngages: 430000,
    montantFacture: 540000,
    montantEncaisse: 540000,
    avancement: 100,
    dateDebut: "2026-01-20",
    dateFinPrevue: "2026-06-15",
    chefProjet: "K. Bianchi",
    risques: [],
  },
  {
    id: "PRJ-2026-011",
    nom: "Réservoir eau potable Beynat",
    client: "Agglo de Brive",
    statut: "en_pause",
    montantContrat: 1250000,
    coutsEngages: 160000,
    montantFacture: 180000,
    montantEncaisse: 180000,
    avancement: 15,
    dateDebut: "2026-02-15",
    dateFinPrevue: "2026-12-15",
    chefProjet: "S. Lefèvre",
    risques: [
      {
        description:
          "Chantier suspendu dans l'attente d'un arrêté préfectoral (recours en cours).",
        gravite: "haute",
        probabilite: "elevee",
      },
    ],
  },
];

// Pondération numérique des niveaux de gravité et de probabilité, utilisée pour
// classer les risques (score = gravité × probabilité).
const POIDS_GRAVITE = { haute: 3, moyenne: 2, basse: 1, faible: 1 };
const POIDS_PROBABILITE = { elevee: 3, moyenne: 2, faible: 1 };

/**
 * Calcule les indicateurs financiers d'un projet.
 * - coutFinalEstime : extrapolation du coût final à partir de l'avancement.
 * - margeEstimee    : marge prévisionnelle à terminaison (montant contrat - coût final estimé).
 * - deficitaire     : vrai si la marge estimée est négative.
 */
export function indicateursProjet(p) {
  const avancement = clamp(p.avancement, 0, 100);
  const coutFinalEstime =
    avancement > 0
      ? Math.round(p.coutsEngages / (avancement / 100))
      : p.coutsEngages;
  const margeEstimee = p.montantContrat - coutFinalEstime;
  const tauxMarge =
    p.montantContrat > 0 ? margeEstimee / p.montantContrat : 0;
  const resteAFacturer = Math.max(0, p.montantContrat - p.montantFacture);
  const encoursNonEncaisse = Math.max(0, p.montantFacture - p.montantEncaisse);

  return {
    coutFinalEstime,
    margeEstimee,
    tauxMarge: round4(tauxMarge),
    deficitaire: margeEstimee < 0,
    resteAFacturer,
    encoursNonEncaisse,
    scoreRisque: scoreRisqueProjet(p),
  };
}

/**
 * Score de risque agrégé d'un projet (somme des gravité × probabilité de ses risques).
 */
function scoreRisqueProjet(p) {
  return (p.risques || []).reduce(
    (s, r) =>
      s + (POIDS_GRAVITE[r.gravite] || 1) * (POIDS_PROBABILITE[r.probabilite] || 1),
    0
  );
}

/**
 * Enrichit chaque projet avec ses indicateurs calculés.
 */
export function projetsEnrichis() {
  return PROJETS.map((p) => ({ ...p, indicateurs: indicateursProjet(p) }));
}

/**
 * Projets déficitaires (marge prévisionnelle négative), triés du plus déficitaire au moins.
 */
export function projetsDeficitaires() {
  return projetsEnrichis()
    .filter((p) => p.indicateurs.deficitaire)
    .sort((a, b) => a.indicateurs.margeEstimee - b.indicateurs.margeEstimee);
}

/**
 * Rentabilité agrégée par client sur l'exercice.
 */
export function rentabiliteClients() {
  const parClient = new Map();
  for (const p of projetsEnrichis()) {
    const c = parClient.get(p.client) || {
      client: p.client,
      nbProjets: 0,
      chiffreAffaires: 0,
      margeEstimee: 0,
      encoursNonEncaisse: 0,
    };
    c.nbProjets += 1;
    c.chiffreAffaires += p.montantFacture;
    c.margeEstimee += p.indicateurs.margeEstimee;
    c.encoursNonEncaisse += p.indicateurs.encoursNonEncaisse;
    parClient.set(p.client, c);
  }
  return [...parClient.values()]
    .map((c) => ({
      ...c,
      tauxMarge: c.chiffreAffaires > 0 ? round4(c.margeEstimee / c.chiffreAffaires) : 0,
    }))
    .sort((a, b) => b.margeEstimee - a.margeEstimee);
}

/**
 * Liste à plat des risques de tous les projets, classés par score décroissant.
 * @param {number} [limite] Nombre maximum de risques à retourner.
 */
export function risquesClasses(limite) {
  const risques = [];
  for (const p of PROJETS) {
    for (const r of p.risques || []) {
      risques.push({
        projet: p.nom,
        projetId: p.id,
        client: p.client,
        description: r.description,
        gravite: r.gravite,
        probabilite: r.probabilite,
        score: (POIDS_GRAVITE[r.gravite] || 1) * (POIDS_PROBABILITE[r.probabilite] || 1),
      });
    }
  }
  risques.sort((a, b) => b.score - a.score);
  return typeof limite === "number" ? risques.slice(0, limite) : risques;
}

/**
 * Tableau de bord global de l'entreprise : agrège tous les KPI.
 * C'est l'objet transmis au Directeur général IA comme base de raisonnement.
 */
export function tableauDeBord() {
  const projets = projetsEnrichis();
  const enCours = projets.filter((p) => p.statut === "en_cours");
  const termines = projets.filter((p) => p.statut === "termine");
  const enPause = projets.filter((p) => p.statut === "en_pause");

  const chiffreAffairesFacture = somme(projets, (p) => p.montantFacture);
  const carnetCommandes = somme(projets, (p) => p.indicateurs.resteAFacturer);
  const margeEstimeeGlobale = somme(projets, (p) => p.indicateurs.margeEstimee);
  const encoursNonEncaisse = somme(projets, (p) => p.indicateurs.encoursNonEncaisse);
  const deficitaires = projetsDeficitaires();

  return {
    exercice: EXERCICE,
    kpi: {
      nbProjetsActifs: enCours.length,
      nbProjetsTermines: termines.length,
      nbProjetsEnPause: enPause.length,
      chiffreAffairesFacture,
      carnetCommandes,
      margeEstimeeGlobale,
      tauxMargeGlobal:
        chiffreAffairesFacture > 0
          ? round4(margeEstimeeGlobale / chiffreAffairesFacture)
          : 0,
      encoursNonEncaisse,
      nbProjetsDeficitaires: deficitaires.length,
      nbRisquesOuverts: risquesClasses().length,
    },
    projets: projets.map((p) => ({
      id: p.id,
      nom: p.nom,
      client: p.client,
      statut: p.statut,
      chefProjet: p.chefProjet,
      avancement: p.avancement,
      dateFinPrevue: p.dateFinPrevue,
      montantContrat: p.montantContrat,
      coutsEngages: p.coutsEngages,
      montantFacture: p.montantFacture,
      montantEncaisse: p.montantEncaisse,
      ...p.indicateurs,
    })),
    projetsDeficitaires: deficitaires.map((p) => ({
      id: p.id,
      nom: p.nom,
      client: p.client,
      margeEstimee: p.indicateurs.margeEstimee,
      tauxMarge: p.indicateurs.tauxMarge,
    })),
    rentabiliteClients: rentabiliteClients(),
    risques: risquesClasses(),
  };
}

// --- Utilitaires ------------------------------------------------------------

function somme(liste, accesseur) {
  return liste.reduce((s, x) => s + (accesseur(x) || 0), 0);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
