// ===========================================================================
// Formats & utilitaires partagés
// ===========================================================================

const euros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function pct(x) {
  return `${Math.round(x * 100)} %`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ===========================================================================
// Navigation par onglets
// ===========================================================================

document.querySelectorAll(".onglet").forEach((onglet) => {
  onglet.addEventListener("click", () => {
    document.querySelectorAll(".onglet").forEach((o) => o.classList.remove("actif"));
    document.querySelectorAll(".panneau").forEach((p) => p.classList.remove("actif"));
    onglet.classList.add("actif");
    document.getElementById(onglet.dataset.cible).classList.add("actif");
  });
});

// ===========================================================================
// Agent Estimateur
// ===========================================================================

const champFichiers = document.getElementById("champFichiers");
const zoneDepot = document.getElementById("zoneDepot");
const listeFichiers = document.getElementById("listeFichiers");
const boutonAnalyser = document.getElementById("boutonAnalyser");
const chargement = document.getElementById("chargement");
const carteErreur = document.getElementById("carteErreur");
const messageErreur = document.getElementById("messageErreur");
const resultats = document.getElementById("resultats");

let fichiers = [];

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

// ===========================================================================
// Agent Gestion documentaire
// ===========================================================================

const LIBELLES_TYPES = {
  contrat: "Contrat",
  plan: "Plan",
  avenant: "Avenant",
  photo: "Photo de chantier",
  proces_verbal: "Procès-verbal",
  courriel: "Courriel",
  fiche_technique: "Fiche technique",
  rapport: "Rapport",
  autre: "Autre",
};

const champFichiersDoc = document.getElementById("champFichiersDoc");
const zoneDepotDoc = document.getElementById("zoneDepotDoc");
const listeFichiersDoc = document.getElementById("listeFichiersDoc");
const texteDoc = document.getElementById("texteDoc");
const boutonClasser = document.getElementById("boutonClasser");
const chargementDoc = document.getElementById("chargementDoc");
const erreurDoc = document.getElementById("erreurDoc");
const listeDocuments = document.getElementById("listeDocuments");
const compteurDocs = document.getElementById("compteurDocs");

const champRecherche = document.getElementById("champRecherche");
const boutonRechercher = document.getElementById("boutonRechercher");
const chargementRecherche = document.getElementById("chargementRecherche");
const syntheseRecherche = document.getElementById("syntheseRecherche");
const listeResultats = document.getElementById("listeResultats");

let fichiersDoc = [];

zoneDepotDoc.addEventListener("dragover", (e) => {
  e.preventDefault();
  zoneDepotDoc.classList.add("survol");
});
zoneDepotDoc.addEventListener("dragleave", () =>
  zoneDepotDoc.classList.remove("survol")
);
zoneDepotDoc.addEventListener("drop", (e) => {
  e.preventDefault();
  zoneDepotDoc.classList.remove("survol");
  ajouterFichiersDoc(e.dataTransfer.files);
});
champFichiersDoc.addEventListener("change", (e) => ajouterFichiersDoc(e.target.files));

function ajouterFichiersDoc(liste) {
  for (const f of liste) {
    if (fichiersDoc.length >= 10) break;
    if (!fichiersDoc.some((x) => x.name === f.name && x.size === f.size)) {
      fichiersDoc.push(f);
    }
  }
  champFichiersDoc.value = "";
  rendreListeDoc();
}

function rendreListeDoc() {
  listeFichiersDoc.innerHTML = "";
  fichiersDoc.forEach((f, i) => {
    const li = document.createElement("li");
    const taille = (f.size / 1024 / 1024).toFixed(1);
    li.innerHTML = `<span>${escapeHtml(f.name)} <em>(${taille} Mo)</em></span>`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "×";
    btn.setAttribute("aria-label", "Retirer");
    btn.addEventListener("click", () => {
      fichiersDoc.splice(i, 1);
      rendreListeDoc();
    });
    li.appendChild(btn);
    listeFichiersDoc.appendChild(li);
  });
}

boutonClasser.addEventListener("click", async () => {
  erreurDoc.hidden = true;
  if (fichiersDoc.length === 0 && !texteDoc.value.trim()) {
    erreurDoc.textContent = "Ajoutez un fichier ou collez un texte à classer.";
    erreurDoc.hidden = false;
    return;
  }

  chargementDoc.hidden = false;
  boutonClasser.disabled = true;

  const formData = new FormData();
  fichiersDoc.forEach((f) => formData.append("fichiers", f));
  if (texteDoc.value.trim()) formData.append("texte", texteDoc.value.trim());

  try {
    const rep = await fetch("/api/documents/classer", {
      method: "POST",
      body: formData,
    });
    const data = await rep.json();
    if (!rep.ok) throw new Error(data.erreur || "Erreur inconnue.");
    fichiersDoc = [];
    texteDoc.value = "";
    rendreListeDoc();
    await chargerDocuments();
  } catch (err) {
    erreurDoc.textContent = err.message;
    erreurDoc.hidden = false;
  } finally {
    chargementDoc.hidden = true;
    boutonClasser.disabled = false;
  }
});

async function chargerDocuments() {
  try {
    const rep = await fetch("/api/documents");
    const data = await rep.json();
    rendreDocuments(data.documents || []);
  } catch {
    /* silencieux : le fonds se rechargera au prochain classement */
  }
}

function rendreDocuments(docs) {
  compteurDocs.textContent = docs.length;
  listeDocuments.innerHTML = "";
  if (docs.length === 0) {
    listeDocuments.innerHTML =
      '<li class="vide">Aucun document archivé pour le moment.</li>';
    return;
  }
  // Plus récents en premier.
  [...docs].reverse().forEach((d) => {
    listeDocuments.appendChild(carteDocument(d));
  });
}

function carteDocument(d) {
  const li = document.createElement("li");
  li.className = "doc";
  const type = LIBELLES_TYPES[d.type] || d.type;
  const meta = [d.projet, d.date].filter(Boolean).join(" · ");
  const motsCles = (d.motsCles || [])
    .map((m) => `<span class="tag">${escapeHtml(m)}</span>`)
    .join("");
  li.innerHTML = `
    <div class="doc-entete">
      <span class="badge-type type-${escapeHtml(d.type)}">${escapeHtml(type)}</span>
      <strong>${escapeHtml(d.titre || "Sans titre")}</strong>
    </div>
    ${meta ? `<p class="doc-meta">${escapeHtml(meta)}</p>` : ""}
    ${d.resume ? `<p class="doc-resume">${escapeHtml(d.resume)}</p>` : ""}
    ${motsCles ? `<div class="doc-tags">${motsCles}</div>` : ""}`;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "doc-supprimer";
  btn.textContent = "Supprimer";
  btn.addEventListener("click", async () => {
    await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
    await chargerDocuments();
  });
  li.appendChild(btn);
  return li;
}

async function lancerRecherche() {
  const requete = champRecherche.value.trim();
  if (!requete) return;

  chargementRecherche.hidden = false;
  syntheseRecherche.hidden = true;
  listeResultats.innerHTML = "";
  boutonRechercher.disabled = true;

  try {
    const rep = await fetch("/api/documents/rechercher", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requete }),
    });
    const data = await rep.json();
    if (!rep.ok) throw new Error(data.erreur || "Erreur inconnue.");

    if (data.synthese) {
      syntheseRecherche.textContent = data.synthese;
      syntheseRecherche.hidden = false;
    }
    if (!data.resultats || data.resultats.length === 0) {
      listeResultats.innerHTML =
        '<li class="vide">Aucun document correspondant.</li>';
    } else {
      data.resultats.forEach((r) => {
        const li = document.createElement("li");
        li.className = "resultat";
        const d = r.document;
        const type = LIBELLES_TYPES[d.type] || d.type;
        li.innerHTML = `
          <div class="doc-entete">
            <span class="badge-type type-${escapeHtml(d.type)}">${escapeHtml(type)}</span>
            <strong>${escapeHtml(d.titre || "Sans titre")}</strong>
            <span class="score">${Math.round(r.pertinence)}%</span>
          </div>
          <p class="doc-resume">${escapeHtml(r.pourquoi)}</p>`;
        listeResultats.appendChild(li);
      });
    }
  } catch (err) {
    listeResultats.innerHTML = `<li class="vide">${escapeHtml(err.message)}</li>`;
  } finally {
    chargementRecherche.hidden = true;
    boutonRechercher.disabled = false;
  }
}

boutonRechercher.addEventListener("click", lancerRecherche);
champRecherche.addEventListener("keydown", (e) => {
  if (e.key === "Enter") lancerRecherche();
});

// Charge le fonds documentaire au démarrage.
chargerDocuments();

// ===========================================================================
// Agent Achats
// ===========================================================================

const besoinAchat = document.getElementById("besoinAchat");
const listeOffres = document.getElementById("listeOffres");
const boutonAjouterFournisseur = document.getElementById("boutonAjouterFournisseur");
const boutonAnalyserAchat = document.getElementById("boutonAnalyserAchat");
const chargementAchat = document.getElementById("chargementAchat");
const erreurAchat = document.getElementById("erreurAchat");
const resultatsAchat = document.getElementById("resultatsAchat");

function ligneArticleHtml() {
  return `
    <div class="article">
      <input type="text" class="art-designation" placeholder="Désignation (ex. Ciment CEM II 35kg)" />
      <input type="number" class="art-quantite" placeholder="Qté" min="0" step="any" />
      <input type="text" class="art-unite" placeholder="Unité" />
      <input type="number" class="art-prix" placeholder="P.U. €" min="0" step="any" />
      <input type="number" class="art-delai" placeholder="Délai (j)" min="0" step="1" />
      <button type="button" class="art-supprimer" aria-label="Retirer l'article">×</button>
    </div>`;
}

function blocFournisseurHtml(index) {
  return `
    <div class="fournisseur" data-index="${index}">
      <div class="fournisseur-entete">
        <input type="text" class="four-nom" placeholder="Nom du fournisseur ${index + 1}" />
        <button type="button" class="four-supprimer" aria-label="Retirer le fournisseur">Retirer</button>
      </div>
      <div class="articles">${ligneArticleHtml()}</div>
      <button type="button" class="bouton-lien ajouter-article">+ Ajouter un article</button>
    </div>`;
}

let compteurFournisseurs = 0;

function ajouterFournisseur() {
  const wrap = document.createElement("div");
  wrap.innerHTML = blocFournisseurHtml(compteurFournisseurs++).trim();
  const bloc = wrap.firstChild;
  listeOffres.appendChild(bloc);
  brancherFournisseur(bloc);
}

function brancherFournisseur(bloc) {
  bloc.querySelector(".four-supprimer").addEventListener("click", () => {
    bloc.remove();
  });
  bloc.querySelector(".ajouter-article").addEventListener("click", () => {
    const wrap = document.createElement("div");
    wrap.innerHTML = ligneArticleHtml().trim();
    const article = wrap.firstChild;
    bloc.querySelector(".articles").appendChild(article);
    brancherArticle(article);
  });
  bloc.querySelectorAll(".article").forEach(brancherArticle);
}

function brancherArticle(article) {
  article.querySelector(".art-supprimer").addEventListener("click", () => {
    const conteneur = article.parentElement;
    if (conteneur.querySelectorAll(".article").length > 1) {
      article.remove();
    }
  });
}

boutonAjouterFournisseur.addEventListener("click", ajouterFournisseur);

// Deux fournisseurs par défaut pour amorcer la comparaison.
ajouterFournisseur();
ajouterFournisseur();

function collecterOffres() {
  const offres = [];
  listeOffres.querySelectorAll(".fournisseur").forEach((bloc) => {
    const nom = bloc.querySelector(".four-nom").value.trim();
    const articles = [];
    bloc.querySelectorAll(".article").forEach((a) => {
      const designation = a.querySelector(".art-designation").value.trim();
      const quantite = parseFloat(a.querySelector(".art-quantite").value);
      const prixUnitaire = parseFloat(a.querySelector(".art-prix").value);
      const unite = a.querySelector(".art-unite").value.trim();
      const delai = parseFloat(a.querySelector(".art-delai").value);
      if (!designation) return;
      articles.push({
        designation,
        quantite: Number.isFinite(quantite) ? quantite : 0,
        unite: unite || "u",
        prixUnitaire: Number.isFinite(prixUnitaire) ? prixUnitaire : 0,
        ...(Number.isFinite(delai) ? { delaiLivraisonJours: delai } : {}),
      });
    });
    if (nom || articles.length) {
      offres.push({ fournisseur: nom || "Fournisseur", articles });
    }
  });
  return offres;
}

boutonAnalyserAchat.addEventListener("click", async () => {
  erreurAchat.hidden = true;
  const offres = collecterOffres();
  const offresValides = offres.filter((o) => o.articles.length > 0);
  if (offresValides.length === 0) {
    erreurAchat.textContent =
      "Renseignez au moins un fournisseur avec un article (désignation requise).";
    erreurAchat.hidden = false;
    return;
  }

  chargementAchat.hidden = false;
  resultatsAchat.hidden = true;
  boutonAnalyserAchat.disabled = true;

  try {
    const rep = await fetch("/api/achats/analyser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ besoin: besoinAchat.value.trim(), offres: offresValides }),
    });
    const data = await rep.json();
    if (!rep.ok) throw new Error(data.erreur || "Erreur inconnue.");
    afficherResultatsAchat(data);
  } catch (err) {
    erreurAchat.textContent = err.message;
    erreurAchat.hidden = false;
  } finally {
    chargementAchat.hidden = true;
    boutonAnalyserAchat.disabled = false;
  }
});

function afficherResultatsAchat({ comparaison, conseil, bonDeCommande }) {
  // Comparatif fournisseurs
  const tbody = document.querySelector("#tableauComparatif tbody");
  tbody.innerHTML = "";
  const moinsDisantNom = comparaison.moinsDisant?.fournisseur;
  comparaison.fournisseurs.forEach((f) => {
    const tr = document.createElement("tr");
    if (f.fournisseur === moinsDisantNom) tr.classList.add("moins-disant");
    tr.innerHTML = `
      <td>${escapeHtml(f.fournisseur)}</td>
      <td class="num">${f.nbArticles}</td>
      <td class="num">${f.delaiMax != null ? f.delaiMax + " j" : "—"}</td>
      <td class="num">${euros.format(f.total)}</td>`;
    tbody.appendChild(tr);
  });

  document.getElementById("recapAchat").innerHTML = `
    <div><span>Fournisseur le moins-disant</span><span>${
      moinsDisantNom
        ? escapeHtml(moinsDisantNom) + " · " + euros.format(comparaison.moinsDisant.total)
        : "—"
    }</span></div>
    <div><span>Panier optimisé (meilleur prix / article)</span><span>${euros.format(
      comparaison.panierOptimise.total
    )}</span></div>
    <div class="total-ht"><span>Économie potentielle</span><span>${euros.format(
      comparaison.economiePotentielle
    )}</span></div>`;

  // Recommandation
  const r = conseil.recommandation;
  const strategies = {
    fournisseur_unique: "Fournisseur unique",
    panier_optimise: "Panier optimisé (multi-fournisseurs)",
    mixte: "Approche mixte",
  };
  document.getElementById("recommandationAchat").innerHTML = `
    <strong>${escapeHtml(strategies[r.strategie] || r.strategie)}${
      r.fournisseur ? " — " + escapeHtml(r.fournisseur) : ""
    }</strong><br />${escapeHtml(r.justification)}`;

  const ulEco = document.getElementById("listeEconomies");
  ulEco.innerHTML = "";
  (conseil.economies || []).forEach((e) => {
    const li = document.createElement("li");
    const gain =
      e.gainEstime != null && Number.isFinite(e.gainEstime)
        ? ` <span class="gain">${euros.format(e.gainEstime)}</span>`
        : "";
    li.innerHTML = `<strong>${escapeHtml(e.levier)}</strong>${gain}<p>${escapeHtml(
      e.description
    )}</p>`;
    ulEco.appendChild(li);
  });
  if (!ulEco.children.length) {
    ulEco.innerHTML = '<li class="vide">Aucun levier d\'économie identifié.</li>';
  }

  const ulRisques = document.getElementById("listeRisques");
  ulRisques.innerHTML = "";
  (conseil.risques || []).forEach((risque) => {
    const li = document.createElement("li");
    li.textContent = risque;
    ulRisques.appendChild(li);
  });
  if (!ulRisques.children.length) {
    ulRisques.innerHTML = '<li class="vide">Aucun risque majeur signalé.</li>';
  }

  // Bon de commande
  const lignes = bonDeCommande.lignes
    .map(
      (l) => `
      <tr>
        <td>${escapeHtml(l.designation)}${
        l.fournisseur ? `<br /><em class="four-ref">${escapeHtml(l.fournisseur)}</em>` : ""
      }</td>
        <td class="num">${nombre.format(l.quantite)}</td>
        <td>${escapeHtml(l.unite)}</td>
        <td class="num">${nombre.format(l.prixUnitaire)}</td>
        <td class="num">${euros.format(l.montant)}</td>
      </tr>`
    )
    .join("");

  document.getElementById("bonCommande").innerHTML = `
    <div class="bc-entete">
      <div>
        <span class="bc-ref">${escapeHtml(bonDeCommande.reference)}</span>
        <strong>${escapeHtml(bonDeCommande.fournisseur)}</strong>
      </div>
      <div class="bc-delai">Livraison : ${escapeHtml(bonDeCommande.delaiLivraison)}</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Désignation</th>
            <th class="num">Qté</th>
            <th>Unité</th>
            <th class="num">P.U. (€)</th>
            <th class="num">Montant (€)</th>
          </tr>
        </thead>
        <tbody>${lignes}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" class="num"><strong>Total HT</strong></td>
            <td class="num"><strong>${euros.format(bonDeCommande.totalHT)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
    ${
      bonDeCommande.conditions
        ? `<p class="bc-conditions"><strong>Conditions :</strong> ${escapeHtml(
            bonDeCommande.conditions
          )}</p>`
        : ""
    }`;

  resultatsAchat.hidden = false;
  resultatsAchat.scrollIntoView({ behavior: "smooth", block: "start" });
}
