import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOSSIER = path.join(__dirname, "..", "data");
const FICHIER = path.join(DOSSIER, "historique.json");

async function lireTout() {
  try {
    const contenu = await fs.readFile(FICHIER, "utf8");
    const data = JSON.parse(contenu);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function ecrireTout(liste) {
  await fs.mkdir(DOSSIER, { recursive: true });
  await fs.writeFile(FICHIER, JSON.stringify(liste, null, 2), "utf8");
}

/**
 * Enregistre une estimation dans l'historique.
 * @param {{nom?:string, extraction:object, estimation:object, controle:object}} projet
 * @returns {Promise<object>} l'entrée créée (métadonnées)
 */
export async function enregistrer(projet) {
  const liste = await lireTout();
  const entree = {
    id: randomUUID(),
    nom: (projet.nom || projet?.extraction?.projet || "Projet sans nom").slice(0, 200),
    date: new Date().toISOString(),
    extraction: projet.extraction,
    estimation: projet.estimation,
    controle: projet.controle,
  };
  liste.unshift(entree);
  await ecrireTout(liste);
  return resume(entree);
}

/** Liste les projets enregistrés (métadonnées uniquement). */
export async function lister() {
  const liste = await lireTout();
  return liste.map(resume);
}

/** Récupère un projet complet par son identifiant. */
export async function recuperer(id) {
  const liste = await lireTout();
  return liste.find((e) => e.id === id) || null;
}

/** Supprime un projet. Renvoie true si un élément a été supprimé. */
export async function supprimer(id) {
  const liste = await lireTout();
  const filtree = liste.filter((e) => e.id !== id);
  if (filtree.length === liste.length) return false;
  await ecrireTout(filtree);
  return true;
}

function resume(e) {
  return {
    id: e.id,
    nom: e.nom,
    date: e.date,
    totalHT: e?.estimation?.totalHT ?? null,
    totalTTC: e?.estimation?.totalTTC ?? null,
    nbOublis: e?.controle?.oublis?.length ?? 0,
  };
}
