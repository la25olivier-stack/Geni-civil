const champFichiers = document.getElementById("champFichiers");
const zoneDepot = document.getElementById("zoneDepot");
const listeFichiers = document.getElementById("listeFichiers");
const boutonAnalyser = document.getElementById("boutonAnalyser");
const chargement = document.getElementById("chargement");
const carteErreur = document.getElementById("carteErreur");
const messageErreur = document.getElementById("messageErreur");
const resultats = document.getElementById("resultats");

let fichiers = [];

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
  document.getElementById("descriptionProjet").textContent =
    extraction.projet || "";
  document.getElementById("observations").textContent =
    extraction.observations || "";

  const tbody = document.querySelector("#tableauEstimation tbody");
  tbody.innerHTML = "";
  estimation.lignes.forEach((l) => {
    const tr = document.createElement("tr");
    if (l.nonClasse) tr.classList.add("non-classe");
    tr.innerHTML = `
      <td>${escapeHtml(l.poste)}</td>
      <td>${escapeHtml(l.libelleCategorie)}</td>
      <td class="num">${nombre.format(l.quantite)}</td>
      <td>${escapeHtml(l.unite)}</td>
      <td class="num">${nombre.format(l.prixUnitaire)}</td>
      <td class="num">${euros.format(l.montant)}</td>`;
    tbody.appendChild(tr);
  });

  const p = estimation.parametres;
  document.getElementById("recap").innerHTML = `
    <div><span>Sous-total travaux</span><span>${euros.format(estimation.sousTotal)}</span></div>
    <div><span>Aléas (${pct(p.tauxAleas)})</span><span>${euros.format(estimation.aleas)}</span></div>
    <div><span>Honoraires / études (${pct(p.tauxHonoraires)})</span><span>${euros.format(estimation.honoraires)}</span></div>
    <div class="total-ht"><span>Total HT</span><span>${euros.format(estimation.totalHT)}</span></div>
    <div><span>TVA (${pct(p.tva)})</span><span>${euros.format(estimation.tva)}</span></div>
    <div class="total-ttc"><span>Total TTC</span><span>${euros.format(estimation.totalTTC)}</span></div>`;

  document.getElementById("syntheseControle").textContent =
    controle.syntheseControle || "";

  const ul = document.getElementById("listeOublis");
  ul.innerHTML = "";
  if (!controle.oublis || controle.oublis.length === 0) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="aucun-oubli">Aucun oubli majeur détecté.</span>`;
    ul.appendChild(li);
  } else {
    controle.oublis.forEach((o) => {
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

  resultats.hidden = false;
  resultats.scrollIntoView({ behavior: "smooth", block: "start" });
}

function pct(x) {
  return `${Math.round(x * 100)} %`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
