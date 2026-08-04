#!/usr/bin/env node
// Démarrage « tout-en-un » des agents IA.
//
// Ce script :
//   1. choisit le moteur (Claude si ANTHROPIC_API_KEY, sinon Ollama gratuit) ;
//   2. en mode Ollama : vérifie l'installation, choisit un modèle adapté à la
//      RAM de la machine, le télécharge si besoin, et démarre « ollama serve » ;
//   3. démarre l'application web.
//
// Usage : npm run go   (ou : node scripts/start.mjs)

import os from "os";
import { spawn, spawnSync } from "child_process";

const GB = 1024 ** 3;
const OLLAMA_HOST = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");

const c = {
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  vert: (s) => `\x1b[32m${s}\x1b[0m`,
  jaune: (s) => `\x1b[33m${s}\x1b[0m`,
  rouge: (s) => `\x1b[31m${s}\x1b[0m`,
  bleu: (s) => `\x1b[36m${s}\x1b[0m`,
  gras: (s) => `\x1b[1m${s}\x1b[0m`,
};

const enfants = [];
function nettoyer() {
  for (const e of enfants) {
    try {
      e.kill();
    } catch {
      /* ignore */
    }
  }
}
process.on("SIGINT", () => {
  nettoyer();
  process.exit(0);
});
process.on("exit", nettoyer);

/** Choisit le fournisseur comme le fait le serveur (llm.js). */
function choisirProvider() {
  const p = (process.env.AGENTS_PROVIDER || "").toLowerCase();
  if (p === "ollama" || p === "anthropic") return p;
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "ollama";
}

/** Recommande un modèle Ollama selon la RAM disponible. */
function modeleSelonRam() {
  const ram = os.totalmem() / GB;
  if (ram >= 16) return { modele: "llama3.1", ram };
  if (ram >= 8) return { modele: "llama3.2", ram };
  return { modele: "llama3.2:1b", ram };
}

function ollamaInstalle() {
  const r = spawnSync("ollama", ["--version"], { shell: true, encoding: "utf8" });
  return r.status === 0;
}

async function ollamaAccessible() {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function modelePresent(modele) {
  const r = spawnSync("ollama", ["list"], { shell: true, encoding: "utf8" });
  if (r.status !== 0) return false;
  const base = modele.split(":")[0];
  return (r.stdout || "")
    .split("\n")
    .some((l) => l.trim().startsWith(modele) || l.trim().startsWith(`${base}:`) || l.trim().startsWith(`${base} `));
}

function demarrerAppli() {
  console.log(c.bleu("\n▶ Démarrage de l'application…\n"));
  const enf = spawn("node", ["server.js"], { stdio: "inherit", shell: false });
  enfants.push(enf);
  enf.on("exit", (code) => process.exit(code ?? 0));
}

async function attendre(predicat, timeoutMs, intervalleMs = 800) {
  const debut = Date.now();
  while (Date.now() - debut < timeoutMs) {
    if (await predicat()) return true;
    await new Promise((r) => setTimeout(r, intervalleMs));
  }
  return false;
}

async function main() {
  console.log(c.gras("\n🏗️  Agents IA — Génie civil"));

  const provider = choisirProvider();

  if (provider === "anthropic") {
    console.log(c.vert("Moteur : Claude (clé API détectée)."));
    return demarrerAppli();
  }

  // --- Mode Ollama (gratuit) ---
  console.log(c.vert("Moteur : Ollama (gratuit, local)."));

  if (!ollamaInstalle()) {
    console.log(c.rouge("\n✖ Ollama n'est pas installé."));
    console.log("  1. Installez-le : " + c.bleu("https://ollama.com"));
    console.log("  2. Relancez : " + c.gras("npm run go"));
    console.log(
      c.gris("\n  (Ou utilisez Claude en définissant ANTHROPIC_API_KEY.)")
    );
    process.exit(1);
  }

  const modele = process.env.OLLAMA_MODEL || modeleSelonRam().modele;
  const ram = Math.round(os.totalmem() / GB);
  process.env.OLLAMA_MODEL = modele;
  console.log(c.gris(`RAM détectée : ~${ram} Go → modèle : ${modele}`));

  // Démarre « ollama serve » si nécessaire.
  if (!(await ollamaAccessible())) {
    console.log(c.gris("Démarrage de « ollama serve »…"));
    const serve = spawn("ollama", ["serve"], { shell: true, stdio: "ignore" });
    enfants.push(serve);
    const ok = await attendre(ollamaAccessible, 20000);
    if (!ok) {
      console.log(
        c.rouge("\n✖ Ollama ne répond pas. Lancez « ollama serve » à la main puis réessayez.")
      );
      process.exit(1);
    }
  }
  console.log(c.vert("✓ Ollama est en marche."));

  // Télécharge le modèle si absent.
  if (!modelePresent(modele)) {
    console.log(c.jaune(`\n⬇ Téléchargement du modèle « ${modele} » (une seule fois)…`));
    const pull = spawnSync("ollama", ["pull", modele], { shell: true, stdio: "inherit" });
    if (pull.status !== 0) {
      console.log(c.rouge(`\n✖ Échec du téléchargement de « ${modele} ».`));
      process.exit(1);
    }
  }
  console.log(c.vert(`✓ Modèle « ${modele} » prêt.`));

  demarrerAppli();
}

main().catch((err) => {
  console.error(c.rouge("Erreur : " + err.message));
  process.exit(1);
});
