// Agent 9 — Gestion des équipements (parc matériel de génie civil).
//
// Ce module tient l'inventaire du parc (camions, paveuses, rouleaux, pelles,
// chargeuses, remorques) et calcule de façon DÉTERMINISTE les indicateurs clés :
// échéances d'entretien et d'inspection, statut de garantie, coûts d'exploitation
// et consommation de carburant. Un agent IA (Claude) s'appuie ensuite sur ces
// indicateurs pour proposer un plan d'action priorisé et des recommandations.
//
// Il n'y a pas de base de données : le parc est conservé en mémoire (Map),
// pré-rempli avec un jeu d'exemples afin que l'interface soit exploitable
// immédiatement.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.EQUIPEMENTS_MODEL || process.env.ESTIMATEUR_MODEL || "claude-opus-5";

let clientAnthropic = null;
function client() {
  if (!clientAnthropic) clientAnthropic = new Anthropic();
  return clientAnthropic;
}

const JOUR_MS = 24 * 60 * 60 * 1000;

// --- Référentiels -----------------------------------------------------------

// Types d'équipements suivis. `compteur` indique l'unité de relevé usuelle :
// "km" pour les engins routiers, "h" (heures moteur) pour les engins de chantier.
export const TYPES_EQUIPEMENT = {
  camion: { libelle: "Camion", icone: "🚚", compteur: "km", uniteConso: "L/100 km" },
  paveuse: { libelle: "Paveuse (finisseur)", icone: "🛣️", compteur: "h", uniteConso: "L/h" },
  rouleau: { libelle: "Rouleau compacteur", icone: "🚧", compteur: "h", uniteConso: "L/h" },
  pelle: { libelle: "Pelle (excavatrice)", icone: "⛏️", compteur: "h", uniteConso: "L/h" },
  chargeuse: { libelle: "Chargeuse", icone: "🚜", compteur: "h", uniteConso: "L/h" },
  remorque: { libelle: "Remorque", icone: "🛻", compteur: "km", uniteConso: "—" },
};

// Catégories de coûts d'exploitation enregistrables par opération.
export const CATEGORIES_COUT = {
  entretien: "Entretien",
  reparation: "Réparation",
  inspection: "Inspection / contrôle",
  carburant: "Carburant",
  assurance: "Assurance",
  pneumatiques: "Pneumatiques / chenilles",
  autre: "Autre",
};

// Seuils (en jours / en unité compteur) sous lesquels une échéance est "urgente"
// ou "à venir". Sert à colorer les alertes de façon homogène côté interface.
const SEUILS = {
  joursUrgent: 15,
  joursAVenir: 45,
  compteurUrgent: 500, // 500 km ou 500 h avant l'échéance
  compteurAVenir: 1500,
};

export function typesDisponibles() {
  return Object.entries(TYPES_EQUIPEMENT).map(([cle, v]) => ({ cle, ...v }));
}

export function categoriesCoutDisponibles() {
  return Object.entries(CATEGORIES_COUT).map(([cle, libelle]) => ({ cle, libelle }));
}

// --- Stockage en mémoire ----------------------------------------------------

const parc = new Map();
let compteurId = 0;

function nouvelId(prefixe = "eq") {
  compteurId += 1;
  return `${prefixe}-${String(compteurId).padStart(3, "0")}`;
}

function normaliserType(type) {
  return TYPES_EQUIPEMENT[type] ? type : "camion";
}

/**
 * Crée un équipement à partir de données brutes en appliquant des valeurs par
 * défaut sûres. Ne calcule aucun indicateur (voir calculerIndicateurs).
 */
function construireEquipement(data = {}) {
  const type = normaliserType(data.type);
  return {
    id: data.id || nouvelId(),
    type,
    nom: (data.nom || "").trim() || `${TYPES_EQUIPEMENT[type].libelle} sans nom`,
    immatriculation: (data.immatriculation || "").trim(),
    marque: (data.marque || "").trim(),
    modele: (data.modele || "").trim(),
    annee: entierOuNull(data.annee),
    valeurAchat: nombreOuNull(data.valeurAchat),
    dateAchat: dateOuNull(data.dateAchat),

    // Compteur (km ou heures selon le type)
    compteurActuel: nombreOu(data.compteurActuel, 0),
    compteurDernierEntretien: nombreOu(data.compteurDernierEntretien, 0),

    // Entretien : échéance à l'usage (unité compteur) et/ou calendaire (mois)
    intervalleEntretien: nombreOuNull(data.intervalleEntretien),
    intervalleEntretienMois: nombreOuNull(data.intervalleEntretienMois),
    dateDernierEntretien: dateOuNull(data.dateDernierEntretien),

    // Inspection réglementaire / contrôle technique (calendaire, en mois)
    intervalleInspectionMois: nombreOu(data.intervalleInspectionMois, 12),
    dateDerniereInspection: dateOuNull(data.dateDerniereInspection),

    // Garantie
    dateFinGarantie: dateOuNull(data.dateFinGarantie),

    // Carburant
    consommationReference: nombreOuNull(data.consommationReference), // L/100km ou L/h

    // Historique des opérations (coûts + carburant)
    operations: Array.isArray(data.operations)
      ? data.operations.map(normaliserOperation).filter(Boolean)
      : [],

    notes: (data.notes || "").trim(),
  };
}

function normaliserOperation(op = {}) {
  if (!op) return null;
  const categorie = CATEGORIES_COUT[op.categorie] ? op.categorie : "autre";
  return {
    id: op.id || nouvelId("op"),
    categorie,
    date: dateOuNull(op.date) || aujourdHuiISO(),
    montant: nombreOu(op.montant, 0),
    litres: categorie === "carburant" ? nombreOuNull(op.litres) : null,
    compteur: nombreOuNull(op.compteur),
    description: (op.description || "").trim(),
  };
}

// --- Calcul des indicateurs (déterministe) ----------------------------------

/**
 * Ajoute des mois à une date ISO et renvoie la date résultante (ISO, YYYY-MM-DD).
 */
function ajouterMois(dateISO, mois) {
  if (!dateISO || !Number.isFinite(mois)) return null;
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + mois);
  return d.toISOString().slice(0, 10);
}

function joursEntre(dateISO, refISO) {
  if (!dateISO) return null;
  const a = new Date(dateISO + "T00:00:00Z").getTime();
  const b = new Date(refISO + "T00:00:00Z").getTime();
  return Math.round((a - b) / JOUR_MS);
}

function statutDepuisJours(jours) {
  if (jours === null) return "inconnu";
  if (jours < 0) return "depasse";
  if (jours <= SEUILS.joursUrgent) return "urgent";
  if (jours <= SEUILS.joursAVenir) return "a_venir";
  return "ok";
}

function statutDepuisCompteur(restant) {
  if (restant === null) return "inconnu";
  if (restant < 0) return "depasse";
  if (restant <= SEUILS.compteurUrgent) return "urgent";
  if (restant <= SEUILS.compteurAVenir) return "a_venir";
  return "ok";
}

// Combine deux statuts en gardant le plus critique.
const RANG_STATUT = { depasse: 4, urgent: 3, a_venir: 2, ok: 1, inconnu: 0 };
function pire(...statuts) {
  return statuts.reduce((acc, s) => (RANG_STATUT[s] > RANG_STATUT[acc] ? s : acc), "inconnu");
}

/**
 * Calcule tous les indicateurs d'un équipement à une date de référence donnée.
 * @param {object} eq équipement (structure de construireEquipement)
 * @param {string} refISO date de référence (ISO YYYY-MM-DD)
 */
export function calculerIndicateurs(eq, refISO = aujourdHuiISO()) {
  const meta = TYPES_EQUIPEMENT[eq.type];
  const uniteCompteur = meta.compteur;

  // --- Entretien (usage) ---
  let entretienUsage = null;
  if (eq.intervalleEntretien) {
    const seuilProchain = eq.compteurDernierEntretien + eq.intervalleEntretien;
    const restant = round1(seuilProchain - eq.compteurActuel);
    entretienUsage = {
      prochainSeuil: round1(seuilProchain),
      restant,
      unite: uniteCompteur,
      statut: statutDepuisCompteur(restant),
    };
  }

  // --- Entretien (calendaire) ---
  let entretienCalendaire = null;
  if (eq.intervalleEntretienMois && eq.dateDernierEntretien) {
    const echeance = ajouterMois(eq.dateDernierEntretien, eq.intervalleEntretienMois);
    const jours = joursEntre(echeance, refISO);
    entretienCalendaire = { echeance, jours, statut: statutDepuisJours(jours) };
  }

  const statutEntretien = pire(
    entretienUsage ? entretienUsage.statut : "inconnu",
    entretienCalendaire ? entretienCalendaire.statut : "inconnu"
  );

  // --- Inspection (calendaire) ---
  let inspection = null;
  if (eq.dateDerniereInspection && eq.intervalleInspectionMois) {
    const echeance = ajouterMois(eq.dateDerniereInspection, eq.intervalleInspectionMois);
    const jours = joursEntre(echeance, refISO);
    inspection = { echeance, jours, statut: statutDepuisJours(jours) };
  } else {
    inspection = { echeance: null, jours: null, statut: "inconnu" };
  }

  // --- Garantie ---
  let garantie = { statut: "inconnu", jours: null, echeance: eq.dateFinGarantie };
  if (eq.dateFinGarantie) {
    const jours = joursEntre(eq.dateFinGarantie, refISO);
    garantie = {
      echeance: eq.dateFinGarantie,
      jours,
      statut: jours < 0 ? "expiree" : jours <= SEUILS.joursAVenir ? "bientot" : "active",
    };
  }

  // --- Coûts ---
  const parCategorie = {};
  let coutTotal = 0;
  let coutCarburant = 0;
  let litresTotal = 0;
  for (const op of eq.operations) {
    parCategorie[op.categorie] = round2((parCategorie[op.categorie] || 0) + op.montant);
    coutTotal = round2(coutTotal + op.montant);
    if (op.categorie === "carburant") {
      coutCarburant = round2(coutCarburant + op.montant);
      if (op.litres) litresTotal = round2(litresTotal + op.litres);
    }
  }
  const coutParUnite = eq.compteurActuel > 0 ? round2(coutTotal / eq.compteurActuel) : null;

  // --- Consommation carburant (méthode plein-à-plein) ---
  // La consommation observée se calcule entre le premier et le dernier plein
  // disposant d'un relevé de compteur : les litres ajoutés APRÈS le plein
  // initial correspondent au carburant brûlé pour parcourir la distance / durée
  // séparant ces deux relevés. Nécessite au moins deux pleins horodatés.
  const pleins = eq.operations
    .filter((op) => op.categorie === "carburant" && op.compteur && op.litres)
    .sort((a, b) => a.compteur - b.compteur);
  let consoObservee = null;
  if (pleins.length >= 2) {
    const span = pleins[pleins.length - 1].compteur - pleins[0].compteur;
    const litresConsommes = pleins.slice(1).reduce((s, p) => s + p.litres, 0);
    if (span > 0) {
      consoObservee = uniteCompteur === "km"
        ? round1((litresConsommes / span) * 100) // L/100 km
        : round1(litresConsommes / span); // L/h
    }
  }
  const carburant = {
    litresTotal,
    coutCarburant,
    uniteConso: meta.uniteConso,
    consoReference: eq.consommationReference,
    consoObservee,
    // Écart relatif observé vs référence (%), utile pour détecter une dérive.
    ecartConso:
      consoObservee !== null && eq.consommationReference
        ? Math.round(((consoObservee - eq.consommationReference) / eq.consommationReference) * 100)
        : null,
  };

  const statutGlobal = pire(
    statutEntretien,
    inspection.statut,
    garantie.statut === "expiree" ? "inconnu" : "ok" // la garantie ne rend pas l'engin "critique"
  );

  return {
    uniteCompteur,
    entretien: { usage: entretienUsage, calendaire: entretienCalendaire, statut: statutEntretien },
    inspection,
    garantie,
    couts: { total: coutTotal, parCategorie, coutParUnite, uniteCompteur },
    carburant,
    statutGlobal,
  };
}

/**
 * Renvoie un équipement enrichi de ses indicateurs.
 */
function avecIndicateurs(eq, refISO) {
  return { ...eq, meta: TYPES_EQUIPEMENT[eq.type], indicateurs: calculerIndicateurs(eq, refISO) };
}

// --- API du parc ------------------------------------------------------------

export function listerEquipements(refISO = aujourdHuiISO()) {
  return [...parc.values()].map((eq) => avecIndicateurs(eq, refISO));
}

export function obtenirEquipement(id, refISO = aujourdHuiISO()) {
  const eq = parc.get(id);
  return eq ? avecIndicateurs(eq, refISO) : null;
}

export function ajouterEquipement(data) {
  const eq = construireEquipement(data);
  parc.set(eq.id, eq);
  return avecIndicateurs(eq);
}

export function modifierEquipement(id, data) {
  const existant = parc.get(id);
  if (!existant) return null;
  const fusion = construireEquipement({ ...existant, ...data, id, operations: existant.operations });
  parc.set(id, fusion);
  return avecIndicateurs(fusion);
}

export function supprimerEquipement(id) {
  return parc.delete(id);
}

export function ajouterOperation(id, op) {
  const eq = parc.get(id);
  if (!eq) return null;
  const operation = normaliserOperation(op);
  eq.operations.push(operation);
  // Un relevé de compteur associé à l'opération met à jour le compteur courant.
  if (operation.compteur && operation.compteur > eq.compteurActuel) {
    eq.compteurActuel = operation.compteur;
  }
  // Une opération d'entretien réinitialise le point de départ de l'échéance usage.
  if (operation.categorie === "entretien") {
    eq.compteurDernierEntretien = operation.compteur || eq.compteurActuel;
    eq.dateDernierEntretien = operation.date;
  }
  if (operation.categorie === "inspection") {
    eq.dateDerniereInspection = operation.date;
  }
  return avecIndicateurs(eq);
}

/**
 * Synthèse agrégée du parc : effectifs par type, coûts globaux, échéances à traiter.
 */
export function syntheseParc(refISO = aujourdHuiISO()) {
  const equipements = listerEquipements(refISO);
  const parType = {};
  let coutTotal = 0;
  let coutCarburantTotal = 0;
  const alertes = { entretien: 0, inspection: 0, garantie: 0 };

  for (const eq of equipements) {
    parType[eq.type] = (parType[eq.type] || 0) + 1;
    coutTotal = round2(coutTotal + eq.indicateurs.couts.total);
    coutCarburantTotal = round2(coutCarburantTotal + eq.indicateurs.carburant.coutCarburant);
    const i = eq.indicateurs;
    if (["urgent", "depasse"].includes(i.entretien.statut)) alertes.entretien += 1;
    if (["urgent", "depasse"].includes(i.inspection.statut)) alertes.inspection += 1;
    if (i.garantie.statut === "expiree" || i.garantie.statut === "bientot") alertes.garantie += 1;
  }

  return {
    effectif: equipements.length,
    parType,
    coutTotal,
    coutCarburantTotal,
    alertes,
  };
}

// --- Agent IA : planification & recommandations -----------------------------

const SCHEMA_PLAN = {
  type: "object",
  properties: {
    synthese: {
      type: "string",
      description: "Synthèse de l'état du parc et des priorités (2-4 phrases).",
    },
    actions: {
      type: "array",
      description: "Actions de maintenance / inspection / gestion à planifier, triées par priorité.",
      items: {
        type: "object",
        properties: {
          equipementId: { type: "string" },
          equipement: { type: "string", description: "Nom lisible de l'équipement concerné." },
          categorie: {
            type: "string",
            enum: ["entretien", "inspection", "garantie", "cout", "carburant"],
          },
          priorite: { type: "string", enum: ["haute", "moyenne", "basse"] },
          echeance: {
            type: "string",
            description: "Quand agir (ex. 'sous 15 jours', date, ou seuil compteur).",
          },
          action: { type: "string", description: "Action recommandée, concrète et concise." },
          justification: { type: "string", description: "Pourquoi cette action, basée sur les indicateurs." },
        },
        required: ["equipement", "categorie", "priorite", "echeance", "action", "justification"],
        additionalProperties: false,
      },
    },
    recommandations: {
      type: "array",
      description: "Recommandations transversales (coûts, carburant, renouvellement, garanties).",
      items: { type: "string" },
    },
  },
  required: ["synthese", "actions", "recommandations"],
  additionalProperties: false,
};

/**
 * Construit un résumé texte du parc, indicateurs inclus, pour le prompt IA.
 */
function resumerParcPourIA(equipements, refISO) {
  return equipements
    .map((eq) => {
      const i = eq.indicateurs;
      const lignes = [`# ${eq.nom} (id: ${eq.id}) — ${eq.meta.libelle}`];
      if (eq.marque || eq.modele) lignes.push(`  Modèle : ${[eq.marque, eq.modele].filter(Boolean).join(" ")}`);
      if (eq.annee) lignes.push(`  Année : ${eq.annee}`);
      lignes.push(`  Compteur : ${eq.compteurActuel} ${i.uniteCompteur}`);

      if (i.entretien.usage) {
        lignes.push(
          `  Entretien (usage) : ${i.entretien.usage.restant} ${i.entretien.usage.unite} restants ` +
            `→ ${i.entretien.usage.statut}`
        );
      }
      if (i.entretien.calendaire) {
        lignes.push(
          `  Entretien (calendaire) : échéance ${i.entretien.calendaire.echeance} ` +
            `(${i.entretien.calendaire.jours} j) → ${i.entretien.calendaire.statut}`
        );
      }
      if (i.inspection.echeance) {
        lignes.push(
          `  Inspection : échéance ${i.inspection.echeance} (${i.inspection.jours} j) → ${i.inspection.statut}`
        );
      }
      lignes.push(
        `  Garantie : ${i.garantie.echeance || "n/c"}` +
          (i.garantie.jours !== null ? ` (${i.garantie.jours} j) → ${i.garantie.statut}` : "")
      );
      lignes.push(`  Coût total exploitation : ${i.couts.total} € (dont carburant ${i.carburant.coutCarburant} €)`);
      if (i.couts.coutParUnite !== null) {
        lignes.push(`  Coût par ${i.uniteCompteur} : ${i.couts.coutParUnite} €`);
      }
      if (i.carburant.consoObservee !== null) {
        lignes.push(
          `  Consommation observée : ${i.carburant.consoObservee} ${i.carburant.uniteConso}` +
            (i.carburant.consoReference ? ` (réf. ${i.carburant.consoReference}, écart ${i.carburant.ecartConso}%)` : "")
        );
      }
      if (eq.notes) lignes.push(`  Notes : ${eq.notes}`);
      return lignes.join("\n");
    })
    .join("\n\n");
}

/**
 * Agent IA — analyse le parc et produit un plan d'action priorisé.
 * @param {string} refISO date de référence
 */
export async function planifierMaintenance(refISO = aujourdHuiISO()) {
  const equipements = listerEquipements(refISO);
  if (equipements.length === 0) {
    return { synthese: "Le parc est vide. Ajoutez des équipements pour générer un plan.", actions: [], recommandations: [] };
  }

  const synthese = syntheseParc(refISO);
  const consigne = `Tu es responsable de la gestion d'un parc d'équipements de génie civil
(camions, paveuses, rouleaux, pelles, chargeuses, remorques).

Date de référence : ${refISO}

Synthèse du parc :
- Effectif : ${synthese.effectif} équipements
- Coût d'exploitation cumulé : ${synthese.coutTotal} € (carburant : ${synthese.coutCarburantTotal} €)
- Alertes en cours : entretien ${synthese.alertes.entretien}, inspection ${synthese.alertes.inspection}, garantie ${synthese.alertes.garantie}

État détaillé (les indicateurs sont déjà calculés, ne les recalcule pas) :

${resumerParcPourIA(equipements, refISO)}

À partir de ces indicateurs :
1. Établis un plan d'action priorisé (entretiens, inspections, garanties à activer,
   dérives de coûts ou de consommation). Traite en premier tout ce qui est "depasse"
   ou "urgent". Réutilise l'id exact de l'équipement (champ equipementId).
2. Ajoute des recommandations transversales : optimisation des coûts, surconsommation
   de carburant, réparations sous garantie à faire prendre en charge, engins vieillissants
   à envisager de renouveler.

Sois concret et actionnable. N'invente pas de données absentes. Réponds en français.`;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { format: { type: "json_schema", schema: SCHEMA_PLAN } },
    messages: [{ role: "user", content: consigne }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("La demande a été refusée par le modèle.");
  }
  const bloc = response.content.find((b) => b.type === "text");
  if (!bloc) throw new Error("Réponse du modèle vide.");
  return JSON.parse(bloc.text);
}

// --- Jeu de données d'exemple ----------------------------------------------

/**
 * Pré-remplit le parc avec quelques équipements représentatifs afin que
 * l'interface soit exploitable sans saisie préalable. Idempotent.
 */
export function amorcerParcExemple() {
  if (parc.size > 0) return;

  ajouterEquipement({
    type: "camion",
    nom: "Camion benne 01",
    immatriculation: "AB-123-CD",
    marque: "Volvo",
    modele: "FMX 8x4",
    annee: 2020,
    valeurAchat: 145000,
    dateAchat: "2020-03-10",
    compteurActuel: 182000,
    compteurDernierEntretien: 175000,
    intervalleEntretien: 15000, // km
    intervalleEntretienMois: 12,
    dateDernierEntretien: "2026-02-15",
    intervalleInspectionMois: 12,
    dateDerniereInspection: "2025-09-01", // contrôle technique bientôt dû
    dateFinGarantie: "2025-03-10", // garantie expirée
    consommationReference: 32, // L/100 km
    operations: [
      { categorie: "carburant", date: "2026-06-15", montant: 820, litres: 600, compteur: 178000 },
      { categorie: "carburant", date: "2026-07-01", montant: 900, litres: 660, compteur: 180000 },
      { categorie: "entretien", date: "2026-02-15", montant: 850, compteur: 175000, description: "Vidange + filtres" },
      { categorie: "reparation", date: "2026-05-20", montant: 1200, description: "Remplacement plaquettes + disques" },
      { categorie: "assurance", date: "2026-01-05", montant: 3600 },
    ],
    notes: "Utilisé sur le chantier de l'autoroute A-Nord.",
  });

  ajouterEquipement({
    type: "pelle",
    nom: "Pelle 22T",
    marque: "Caterpillar",
    modele: "320",
    annee: 2019,
    valeurAchat: 210000,
    dateAchat: "2019-06-01",
    compteurActuel: 9850, // heures
    compteurDernierEntretien: 9500,
    intervalleEntretien: 500, // h
    intervalleEntretienMois: 6,
    dateDernierEntretien: "2026-04-10",
    intervalleInspectionMois: 12,
    dateDerniereInspection: "2026-01-20",
    dateFinGarantie: "2026-09-15", // garantie bientôt expirée
    consommationReference: 18, // L/h
    operations: [
      { categorie: "carburant", date: "2026-06-18", montant: 1160, litres: 800, compteur: 9700 },
      { categorie: "carburant", date: "2026-07-10", montant: 3650, litres: 2520, compteur: 9820 },
      { categorie: "entretien", date: "2026-04-10", montant: 1400, compteur: 9500 },
      { categorie: "reparation", date: "2026-06-30", montant: 2600, description: "Vérin de flèche - fuite hydraulique" },
    ],
    notes: "Surconsommation signalée par l'opérateur.",
  });

  ajouterEquipement({
    type: "rouleau",
    nom: "Rouleau tandem 03",
    marque: "Hamm",
    modele: "DV+ 70",
    annee: 2021,
    valeurAchat: 98000,
    dateAchat: "2021-05-12",
    compteurActuel: 3200,
    compteurDernierEntretien: 3050,
    intervalleEntretien: 500,
    intervalleEntretienMois: 12,
    dateDernierEntretien: "2026-06-01",
    intervalleInspectionMois: 12,
    dateDerniereInspection: "2026-06-01",
    dateFinGarantie: "2027-05-12",
    consommationReference: 9,
    operations: [
      { categorie: "carburant", date: "2026-06-22", montant: 420, litres: 300, compteur: 3100 },
      { categorie: "carburant", date: "2026-07-05", montant: 1020, litres: 730, compteur: 3180 },
      { categorie: "entretien", date: "2026-06-01", montant: 620, compteur: 3050 },
    ],
  });

  ajouterEquipement({
    type: "paveuse",
    nom: "Finisseur 01",
    marque: "Vögele",
    modele: "SUPER 1800-3i",
    annee: 2018,
    valeurAchat: 320000,
    dateAchat: "2018-04-20",
    compteurActuel: 7400,
    compteurDernierEntretien: 6900,
    intervalleEntretien: 500,
    intervalleEntretienMois: 12,
    dateDernierEntretien: "2025-11-15",
    intervalleInspectionMois: 12,
    dateDerniereInspection: "2025-07-15", // inspection dépassée
    dateFinGarantie: "2023-04-20",
    consommationReference: 25,
    operations: [
      { categorie: "carburant", date: "2026-06-25", montant: 1450, litres: 1000, compteur: 7200 },
      { categorie: "carburant", date: "2026-07-12", montant: 5650, litres: 3900, compteur: 7350 },
      { categorie: "entretien", date: "2025-11-15", montant: 2100, compteur: 6900 },
      { categorie: "reparation", date: "2026-03-14", montant: 4800, description: "Table de répandage - résistances" },
    ],
    notes: "Engin vieillissant, renouvellement à étudier.",
  });

  ajouterEquipement({
    type: "chargeuse",
    nom: "Chargeuse 05",
    marque: "Liebherr",
    modele: "L 566",
    annee: 2022,
    valeurAchat: 175000,
    dateAchat: "2022-02-01",
    compteurActuel: 2100,
    compteurDernierEntretien: 2000,
    intervalleEntretien: 500,
    intervalleEntretienMois: 12,
    dateDernierEntretien: "2026-03-01",
    intervalleInspectionMois: 12,
    dateDerniereInspection: "2026-03-01",
    dateFinGarantie: "2025-02-01",
    consommationReference: 14,
    operations: [
      { categorie: "carburant", date: "2026-06-20", montant: 720, litres: 500, compteur: 1950 },
      { categorie: "carburant", date: "2026-07-08", montant: 2740, litres: 1900, compteur: 2080 },
      { categorie: "entretien", date: "2026-03-01", montant: 950, compteur: 2000 },
    ],
  });

  ajouterEquipement({
    type: "remorque",
    nom: "Porte-engins 02",
    immatriculation: "EF-456-GH",
    marque: "Nooteboom",
    modele: "OSDS-48-03",
    annee: 2017,
    valeurAchat: 62000,
    dateAchat: "2017-08-15",
    compteurActuel: 95000, // km
    intervalleInspectionMois: 12,
    dateDerniereInspection: "2025-08-20", // contrôle bientôt dû
    dateFinGarantie: "2019-08-15",
    operations: [
      { categorie: "inspection", date: "2025-08-20", montant: 180 },
      { categorie: "pneumatiques", date: "2026-04-02", montant: 2400, description: "Remplacement 4 pneus" },
    ],
    notes: "Vérifier freinage avant prochaine mission.",
  });
}

// --- Utilitaires -----------------------------------------------------------

function aujourdHuiISO() {
  return new Date().toISOString().slice(0, 10);
}
function nombreOu(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function nombreOuNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function entierOuNull(v) {
  const n = nombreOuNull(v);
  return n === null ? null : Math.trunc(n);
}
function dateOuNull(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
