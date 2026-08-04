const champFichiers = document.getElementById("champFichiers");
const zoneDepot = document.getElementById("zoneDepot");
const listeFichiers = document.getElementById("listeFichiers");
const boutonAnalyser = document.getElementById("boutonAnalyser");
const chargement = document.getElementById("chargement");
const carteErreur = document.getElementById("carteErreur");
const messageErreur = document.getElementById("messageErreur");
const resultats = document.getElementById("resultats");

const boutonEnregistrer = document.getElementById("boutonEnregistrer");
const boutonCsv = document.getElementById("boutonCsv");
const boutonImprimer = document.getElementById("boutonImprimer");
const boutonRafraichir = document.getElementById("boutonRafraichir");
const listeHistorique = document.getElementById("listeHistorique");

let fichiers = [];
let etat = null; // { extraction, estimation, controle }

const euros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// --- Gestion des fichiers ---------------------------------------------------

zoneDepot.addEventListener("dragover", (e) => {
  e.preventDefault();
  zoneDepot.classList.add("survol");
});
zoneDepot.addEventListener("dragleave", () => zoneDepot.classList.remove("survol"));
zoneDepot.addEventListener("drop", (e) => {
  e.preventDefault();
  zoneDepot.classList.remove("survol");
  ajouterFichiers(e.dataTransfer.files);
});

champFichiers.addEventListener("change", (e) => ajouterFichiers(e.target.files));

function ajouterFichiers(liste) {
  for (const f of liste) {
    if (fichiers.length >= 10) break;
    if (!fichiers.some((x) => x.name === f.name && x.size === f.size)) {
      fichiers.push(f);
    }
  }
  champFichiers.value = "";
  rendreListe();
}

function rendreListe() {
  listeFichiers.innerHTML = "";
  fichiers.forEach((f, i) => {
    const li = document.createElement("li");
    const taille = (f.size / 1024 / 1024).toFixed(1);
    li.innerHTML = `<span>${escapeHtml(f.name)} <em>(${taille} Mo)</em></span>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "×";
    btn.setAttribute("aria-label", "Retirer");
    btn.addEventListener("click", () => {
      fichiers.splice(i, 1);
      rendreListe();
    });
    li.appendChild(btn);
    listeFichiers.appendChild(li);
  });
  boutonAnalyser.disabled = fichiers.length === 0;
}

// --- Lancement de l'estimation ---------------------------------------------

boutonAnalyser.addEventListener("click", async () => {
  carteErreur.hidden = true;
  resultats.hidden = true;
  chargement.hidden = false;
  boutonAnalyser.disabled = true;

  const formData = new FormData();
  fichiers.forEach((f) => formData.append("plans", f));

  try {
    const rep = await fetch("/api/estimation", { method: "POST", body: formData });
    const data = await rep.json();
    if (!rep.ok) throw new Error(data.erreur || "Erreur inconnue.");
    etat = data;
    afficherResultats(data);
  } catch (err) {
    messageErreur.textContent = err.message;
    carteErreur.hidden = false;
  } finally {
    chargement.hidden = true;
    boutonAnalyser.disabled = fichiers.length === 0;
  }
});

// --- Affichage des résultats -----------------------------------------------

function afficherResultats({ extraction, estimation, controle }) {
  etat = { extraction, estimation, controle };

  document.getElementById("descriptionProjet").textContent =
    extraction.projet || "";
  document.getElementById("observations").textContent =
    extraction.observations || "";

  const tbody = document.querySelector("#tableauEstimation tbody");
  tbody.innerHTML = "";
  estimation.lignes.forEach((l, index) => {
    const tr = document.createElement("tr");
    if (l.nonClasse) tr.classList.add("non-classe");
    tr.innerHTML = `
      <td>${escapeHtml(l.poste)}</td>
      <td>${escapeHtml(l.libelleCategorie)}</td>
      <td class="num">${nombre.format(l.quantite)}</td>
      <td>${escapeHtml(l.unite)}</td>
      <td class="num">
        <input type="number" class="pu-input" min="0" step="0.01"
               data-index="${index}" value="${l.prixUnitaire}" />
      </td>
      <td class="num montant" data-index="${index}">${euros.format(l.montant)}</td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".pu-input").forEach((input) => {
    input.addEventListener("input", onPrixModifie);
  });

  rendreRecap();
  afficherControle(controle);

  resultats.hidden = false;
  resultats.scrollIntoView({ behavior: "smooth", block: "start" });
}

function afficherControle(controle) {
  document.getElementById("syntheseControle").textContent =
    controle?.syntheseControle || "";

  const ul = document.getElementById("listeOublis");
  ul.innerHTML = "";
  const oublis = controle?.oublis || [];
  if (oublis.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="aucun-oubli">Aucun oubli majeur détecté.</span>`;
    ul.appendChild(li);
    return;
  }
  oublis.forEach((o) => {
    const li = document.createElement("li");
    li.classList.add(o.gravite);
    li.innerHTML = `
      <div class="oubli-titre">
        <strong>${escapeHtml(o.poste)}</strong>
        <span class="badge ${o.gravite}">${o.gravite}</span>
      </div>
      <p class="oubli-justif">${escapeHtml(o.justification)}</p>`;
    ul.appendChild(li);
  });
}

// --- Édition des prix + recalcul client-side -------------------------------

function onPrixModifie(e) {
  const index = Number(e.target.dataset.index);
  const ligne = etat.estimation.lignes[index];
  if (!ligne) return;
  const pu = parseFloat(e.target.value);
  ligne.prixUnitaire = Number.isFinite(pu) && pu >= 0 ? pu : 0;
  ligne.montant = round2(ligne.quantite * ligne.prixUnitaire);

  const cellule = document.querySelector(`.montant[data-index="${index}"]`);
  if (cellule) cellule.textContent = euros.format(ligne.montant);

  recalculerTotaux();
  rendreRecap();
}

function recalculerTotaux() {
  const est = etat.estimation;
  const p = est.parametres;
  est.sousTotal = round2(est.lignes.reduce((s, l) => s + l.montant, 0));
  est.aleas = round2(est.sousTotal * p.tauxAleas);
  est.honoraires = round2(est.sousTotal * p.tauxHonoraires);
  est.totalHT = round2(est.sousTotal + est.aleas + est.honoraires);
  est.tva = round2(est.totalHT * p.tva);
  est.totalTTC = round2(est.totalHT + est.tva);
}

function rendreRecap() {
  const est = etat.estimation;
  const p = est.parametres;
  document.getElementById("recap").innerHTML = `
    <div><span>Sous-total travaux</span><span>${euros.format(est.sousTotal)}</span></div>
    <div><span>Aléas (${pct(p.tauxAleas)})</span><span>${euros.format(est.aleas)}</span></div>
    <div><span>Honoraires / études (${pct(p.tauxHonoraires)})</span><span>${euros.format(est.honoraires)}</span></div>
    <div class="total-ht"><span>Total HT</span><span>${euros.format(est.totalHT)}</span></div>
    <div><span>TVA (${pct(p.tva)})</span><span>${euros.format(est.tva)}</span></div>
    <div class="total-ttc"><span>Total TTC</span><span>${euros.format(est.totalTTC)}</span></div>`;
}

// --- Export CSV ------------------------------------------------------------

boutonCsv.addEventListener("click", () => {
  if (!etat) return;
  const est = etat.estimation;
  const sep = ";";
  const lignes = [
    ["Poste", "Catégorie", "Quantité", "Unité", "P.U. (€)", "Montant (€)"],
    ...est.lignes.map((l) => [
      l.poste,
      l.libelleCategorie,
      l.quantite,
      l.unite,
      l.prixUnitaire,
      l.montant,
    ]),
    [],
    ["Sous-total travaux", "", "", "", "", est.sousTotal],
    ["Aléas", "", "", "", "", est.aleas],
    ["Honoraires / études", "", "", "", "", est.honoraires],
    ["Total HT", "", "", "", "", est.totalHT],
    ["TVA", "", "", "", "", est.tva],
    ["Total TTC", "", "", "", "", est.totalTTC],
  ];
  const csv = lignes
    .map((ligne) => ligne.map(champCsv).join(sep))
    .join("\r\n");
  // BOM UTF-8 pour Excel
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  telecharger(blob, `estimation-${horodatageFichier()}.csv`);
});

function champCsv(valeur) {
  const s = String(valeur ?? "");
  if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// --- Impression / PDF ------------------------------------------------------

boutonImprimer.addEventListener("click", () => {
  if (!etat) return;
  window.print();
});

// --- Historique ------------------------------------------------------------

boutonEnregistrer.addEventListener("click", async () => {
  if (!etat) return;
  const nomParDefaut = etat.extraction?.projet || "Projet sans nom";
  const nom = window.prompt("Nom du projet à enregistrer :", nomParDefaut);
  if (nom === null) return;
  boutonEnregistrer.disabled = true;
  try {
    const rep = await fetch("/api/historique", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, ...etat }),
    });
    if (!rep.ok) {
      const d = await rep.json().catch(() => ({}));
      throw new Error(d.erreur || "Échec de l'enregistrement.");
    }
    await chargerHistorique();
  } catch (err) {
    alert(err.message);
  } finally {
    boutonEnregistrer.disabled = false;
  }
});

boutonRafraichir.addEventListener("click", chargerHistorique);

async function chargerHistorique() {
  try {
    const rep = await fetch("/api/historique");
    const projets = await rep.json();
    rendreHistorique(projets);
  } catch {
    // silencieux : l'historique n'est pas bloquant
  }
}

function rendreHistorique(projets) {
  listeHistorique.innerHTML = "";
  if (!projets || projets.length === 0) {
    listeHistorique.innerHTML =
      '<li class="historique-vide">Aucun projet enregistré pour l\'instant.</li>';
    return;
  }
  projets.forEach((p) => {
    const li = document.createElement("li");
    const date = new Date(p.date).toLocaleString("fr-FR");
    const montant = p.totalTTC != null ? euros.format(p.totalTTC) : "—";
    li.innerHTML = `
      <div class="historique-infos">
        <strong>${escapeHtml(p.nom)}</strong>
        <span class="historique-meta">${date} · ${montant} TTC · ${p.nbOublis} oubli(s)</span>
      </div>`;
    const actions = document.createElement("div");
    actions.className = "historique-actions";

    const charger = document.createElement("button");
    charger.className = "bouton-secondaire";
    charger.type = "button";
    charger.textContent = "Charger";
    charger.addEventListener("click", () => chargerProjet(p.id));

    const suppr = document.createElement("button");
    suppr.className = "lien-supprimer";
    suppr.type = "button";
    suppr.textContent = "Supprimer";
    suppr.addEventListener("click", () => supprimerProjet(p.id));

    actions.append(charger, suppr);
    li.appendChild(actions);
    listeHistorique.appendChild(li);
  });
}

async function chargerProjet(id) {
  try {
    const rep = await fetch(`/api/historique/${id}`);
    if (!rep.ok) throw new Error("Projet introuvable.");
    const projet = await rep.json();
    afficherResultats(projet);
  } catch (err) {
    alert(err.message);
  }
}

async function supprimerProjet(id) {
  if (!confirm("Supprimer ce projet de l'historique ?")) return;
  try {
    const rep = await fetch(`/api/historique/${id}`, { method: "DELETE" });
    if (!rep.ok && rep.status !== 204) throw new Error("Échec de la suppression.");
    await chargerHistorique();
  } catch (err) {
    alert(err.message);
  }
}

// --- Utilitaires -----------------------------------------------------------

function telecharger(blob, nomFichier) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function horodatageFichier() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function pct(x) {
  return `${Math.round(x * 100)} %`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Chargement initial de l'historique
chargerHistorique();
