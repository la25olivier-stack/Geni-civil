// Bordereau de prix unitaires indicatif pour le génie civil (France, ordre de grandeur).
// Ces prix servent à produire une PREMIÈRE estimation. Ils doivent être ajustés
// selon le contexte du projet (région, quantités, contraintes, année).
//
// Chaque poste est repéré par une catégorie normalisée. L'estimateur IA classe
// chaque ouvrage détecté dans l'une de ces catégories ; le prix unitaire est
// ensuite appliqué à la quantité relevée.

export const CATALOGUE = {
  installation_chantier: {
    libelle: "Installation et repli de chantier",
    unite: "ft",
    prixUnitaire: 15000,
  },
  terrassement_deblai: {
    libelle: "Terrassement en déblai",
    unite: "m3",
    prixUnitaire: 18,
  },
  terrassement_remblai: {
    libelle: "Remblai compacté",
    unite: "m3",
    prixUnitaire: 22,
  },
  fondation_semelle: {
    libelle: "Fondations - semelles béton armé",
    unite: "m3",
    prixUnitaire: 320,
  },
  fondation_pieux: {
    libelle: "Fondations profondes - pieux",
    unite: "ml",
    prixUnitaire: 180,
  },
  beton_proprete: {
    libelle: "Béton de propreté",
    unite: "m3",
    prixUnitaire: 140,
  },
  beton_arme: {
    libelle: "Béton armé (voiles, poteaux, poutres)",
    unite: "m3",
    prixUnitaire: 350,
  },
  dallage: {
    libelle: "Dallage / plancher béton",
    unite: "m2",
    prixUnitaire: 65,
  },
  coffrage: {
    libelle: "Coffrage",
    unite: "m2",
    prixUnitaire: 55,
  },
  armatures: {
    libelle: "Armatures / aciers HA",
    unite: "kg",
    prixUnitaire: 2.2,
  },
  maconnerie: {
    libelle: "Maçonnerie (blocs, briques)",
    unite: "m2",
    prixUnitaire: 90,
  },
  charpente_metallique: {
    libelle: "Charpente métallique",
    unite: "kg",
    prixUnitaire: 4.5,
  },
  etancheite: {
    libelle: "Étanchéité",
    unite: "m2",
    prixUnitaire: 45,
  },
  vrd_reseaux: {
    libelle: "VRD - réseaux enterrés",
    unite: "ml",
    prixUnitaire: 120,
  },
  voirie: {
    libelle: "Voirie / enrobés",
    unite: "m2",
    prixUnitaire: 40,
  },
  assainissement: {
    libelle: "Assainissement (canalisations, regards)",
    unite: "ml",
    prixUnitaire: 150,
  },
  ouvrage_art: {
    libelle: "Ouvrage d'art / structure spéciale",
    unite: "m3",
    prixUnitaire: 800,
  },
  divers: {
    libelle: "Divers / non classé",
    unite: "u",
    prixUnitaire: 0,
  },
};

// Taux appliqués à la sous-totalisation pour obtenir un montant d'opération.
export const PARAMETRES = {
  tauxAleas: 0.1, // provision pour aléas / imprévus (10 %)
  tauxHonoraires: 0.08, // maîtrise d'oeuvre, études (8 %)
  tva: 0.2, // TVA (20 %)
};

export function categoriesDisponibles() {
  return Object.keys(CATALOGUE);
}

/**
 * Applique le bordereau de prix aux ouvrages détectés et calcule l'estimation.
 * @param {Array<{poste:string, categorie:string, description?:string, quantite:number, unite:string, hypotheses?:string}>} ouvrages
 * @returns {{lignes:Array, sousTotal:number, aleas:number, honoraires:number, totalHT:number, tva:number, totalTTC:number, parametres:object}}
 */
export function chiffrer(ouvrages) {
  const lignes = (ouvrages || []).map((o) => {
    const cat = CATALOGUE[o.categorie] ? o.categorie : "divers";
    const ref = CATALOGUE[cat];
    const quantite = Number.isFinite(o.quantite) ? o.quantite : 0;
    const prixUnitaire = ref.prixUnitaire;
    const montant = Math.round(quantite * prixUnitaire * 100) / 100;
    return {
      poste: o.poste || ref.libelle,
      categorie: cat,
      libelleCategorie: ref.libelle,
      description: o.description || "",
      quantite,
      unite: o.unite || ref.unite,
      prixUnitaire,
      montant,
      hypotheses: o.hypotheses || "",
      nonClasse: cat === "divers",
    };
  });

  const sousTotal = round2(lignes.reduce((s, l) => s + l.montant, 0));
  const aleas = round2(sousTotal * PARAMETRES.tauxAleas);
  const honoraires = round2(sousTotal * PARAMETRES.tauxHonoraires);
  const totalHT = round2(sousTotal + aleas + honoraires);
  const tva = round2(totalHT * PARAMETRES.tva);
  const totalTTC = round2(totalHT + tva);

  return {
    lignes,
    sousTotal,
    aleas,
    honoraires,
    totalHT,
    tva,
    totalTTC,
    parametres: PARAMETRES,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
