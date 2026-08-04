// Agent 9 — Gestion des équipements : logique de l'interface.

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const nombre = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

let referentiels = { types: [], categoriesCout: [] };

// Libellés lisibles des statuts d'échéance.
const LIBELLE_STATUT = {
  depasse: "Dépassé",
  urgent: "Urgent",
  a_venir: "À venir",
  ok: "OK",
  inconnu: "N/C",
  expiree: "Expirée",
  bientot: "Bientôt",
  active: "Active",
};

// --- Chargement initial -----------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  brancherEvenements();
  await chargerReferentiels();
  await chargerParc();
});

async function chargerReferentiels() {
  try {
    const rep = await fetch("/api/equipements/referentiels");
    referentiels = await rep.json();
    remplirSelectType();
    remplirSelectCategorie();
  } catch (err) {
    console.error("Référentiels indisponibles", err);
  }
}

function remplirSelectType() {
  const sel = document.getElementById("champType");
  sel.innerHTML = "";
  referentiels.types.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.cle;
    opt.textContent = `${t.icone} ${t.libelle}`;
    sel.appendChild(opt);
  });
}

function remplirSelectCategorie() {
  const sel = document.getElementById("champCategorie");
  sel.innerHTML = "";
  referentiels.categoriesCout.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.cle;
    opt.textContent = c.libelle;
    sel.appendChild(opt);
  });
}

// --- Parc & synthèse --------------------------------------------------------

async function chargerParc() {
  const chargement = document.getElementById("chargementParc");
  chargement.hidden = false;
  try {
    const rep = await fetch("/api/equipements");
    const data = await rep.json();
    afficherSynthese(data.synthese);
    afficherParc(data.equipements);
  } catch (err) {
    console.error(err);
  } finally {
    chargement.hidden = true;
  }
}

function afficherSynthese(s) {
  const kpis = document.getElementById("kpis");
  const alertesTotal = s.alertes.entretien + s.alertes.inspection + s.alertes.garantie;
  kpis.innerHTML = `
    <div class="kpi"><span class="kpi-valeur">${s.effectif}</span><span class="kpi-libelle">Équipements</span></div>
    <div class="kpi"><span class="kpi-valeur">${euros.format(s.coutTotal)}</span><span class="kpi-libelle">Coût d'exploitation</span></div>
    <div class="kpi"><span class="kpi-valeur">${euros.format(s.coutCarburantTotal)}</span><span class="kpi-libelle">Dont carburant</span></div>
    <div class="kpi ${alertesTotal ? "kpi-alerte" : ""}">
      <span class="kpi-valeur">${alertesTotal}</span>
      <span class="kpi-libelle">Alertes (E:${s.alertes.entretien} · I:${s.alertes.inspection} · G:${s.alertes.garantie})</span>
    </div>`;
}

function afficherParc(equipements) {
  const grille = document.getElementById("grilleEquipements");
  grille.innerHTML = "";
  if (equipements.length === 0) {
    grille.innerHTML = `<p class="aide">Aucun équipement. Cliquez sur « Ajouter un équipement ».</p>`;
    return;
  }
  equipements.forEach((eq) => grille.appendChild(carteEquipement(eq)));
}

function carteEquipement(eq) {
  const i = eq.indicateurs;
  const carte = document.createElement("article");
  carte.className = `equipement statut-${i.statutGlobal}`;

  const sousTitre = [eq.marque, eq.modele, eq.annee].filter(Boolean).join(" ");
  const conso = i.carburant.consoObservee !== null
    ? `${nombre.format(i.carburant.consoObservee)} ${i.carburant.uniteConso}` +
      (i.carburant.ecartConso !== null ? ` <em class="${i.carburant.ecartConso > 10 ? "ecart-haut" : ""}">(${i.carburant.ecartConso > 0 ? "+" : ""}${i.carburant.ecartConso}%)</em>` : "")
    : "—";

  carte.innerHTML = `
    <div class="equipement-entete">
      <div>
        <h3>${eq.meta.icone} ${escapeHtml(eq.nom)}</h3>
        <p class="equipement-sous">${escapeHtml(sousTitre || eq.meta.libelle)}${eq.immatriculation ? " · " + escapeHtml(eq.immatriculation) : ""}</p>
      </div>
      <span class="pastille ${i.statutGlobal}">${LIBELLE_STATUT[i.statutGlobal] || i.statutGlobal}</span>
    </div>

    <dl class="indicateurs">
      <div><dt>Compteur</dt><dd>${nombre.format(eq.compteurActuel)} ${i.uniteCompteur}</dd></div>
      <div><dt>Entretien</dt><dd>${ligneEntretien(i)}</dd></div>
      <div><dt>Inspection</dt><dd>${ligneEcheance(i.inspection)}</dd></div>
      <div><dt>Garantie</dt><dd>${ligneGarantie(i.garantie)}</dd></div>
      <div><dt>Coût total</dt><dd>${euros.format(i.couts.total)}${i.couts.coutParUnite !== null ? ` <em>(${euros.format(i.couts.coutParUnite)}/${i.uniteCompteur})</em>` : ""}</dd></div>
      <div><dt>Carburant</dt><dd>${conso}</dd></div>
    </dl>

    <div class="equipement-actions">
      <button class="bouton-lien" data-op="${eq.id}">+ Opération</button>
      <button class="bouton-lien danger" data-suppr="${eq.id}">Supprimer</button>
    </div>`;

  carte.querySelector("[data-op]").addEventListener("click", () => ouvrirModaleOperation(eq));
  carte.querySelector("[data-suppr]").addEventListener("click", () => supprimerEquipement(eq));
  return carte;
}

function ligneEntretien(i) {
  const parts = [];
  if (i.entretien.usage) {
    const u = i.entretien.usage;
    parts.push(`<span class="badge-statut ${u.statut}">${nombre.format(u.restant)} ${u.unite}</span>`);
  }
  if (i.entretien.calendaire) {
    const c = i.entretien.calendaire;
    parts.push(`<span class="badge-statut ${c.statut}">${formaterEcheanceJours(c)}</span>`);
  }
  return parts.length ? parts.join(" ") : "—";
}

function ligneEcheance(e) {
  if (!e || !e.echeance) return "—";
  return `<span class="badge-statut ${e.statut}">${formaterEcheanceJours(e)}</span>`;
}

function ligneGarantie(g) {
  if (!g || !g.echeance) return "—";
  const cls = g.statut === "expiree" ? "depasse" : g.statut === "bientot" ? "urgent" : "ok";
  const txt = g.statut === "expiree" ? "Expirée" : `${g.echeance} (${g.jours} j)`;
  return `<span class="badge-statut ${cls}">${txt}</span>`;
}

function formaterEcheanceJours(e) {
  if (e.jours === null) return e.echeance || "—";
  if (e.jours < 0) return `${e.echeance} (retard ${Math.abs(e.jours)} j)`;
  return `${e.echeance} (${e.jours} j)`;
}

async function supprimerEquipement(eq) {
  if (!confirm(`Supprimer « ${eq.nom} » du parc ?`)) return;
  await fetch(`/api/equipements/${eq.id}`, { method: "DELETE" });
  await chargerParc();
}

// --- Plan de maintenance IA -------------------------------------------------

async function genererPlan() {
  const bouton = document.getElementById("boutonPlan");
  const chargement = document.getElementById("chargementPlan");
  const resultat = document.getElementById("resultatPlan");
  const erreur = document.getElementById("erreurPlan");

  bouton.disabled = true;
  erreur.hidden = true;
  resultat.hidden = true;
  chargement.hidden = false;

  try {
    const rep = await fetch("/api/equipements/plan", { method: "POST" });
    const data = await rep.json();
    if (!rep.ok) throw new Error(data.erreur || "Erreur inconnue.");
    afficherPlan(data);
  } catch (err) {
    document.getElementById("messageErreurPlan").textContent = err.message;
    erreur.hidden = false;
  } finally {
    chargement.hidden = true;
    bouton.disabled = false;
  }
}

function afficherPlan(plan) {
  document.getElementById("synthesePlan").textContent = plan.synthese || "";

  const liste = document.getElementById("listeActions");
  liste.innerHTML = "";
  (plan.actions || []).forEach((a) => {
    const li = document.createElement("li");
    li.classList.add(prioriteVersClasse(a.priorite));
    li.innerHTML = `
      <div class="oubli-titre">
        <strong>${escapeHtml(a.equipement)} — ${escapeHtml(a.action)}</strong>
        <span class="badge ${prioriteVersClasse(a.priorite)}">${escapeHtml(a.priorite)}</span>
      </div>
      <p class="oubli-justif">
        <span class="tag-cat">${escapeHtml(a.categorie)}</span>
        <span class="tag-echeance">⏱ ${escapeHtml(a.echeance)}</span>
        ${escapeHtml(a.justification)}
      </p>`;
    liste.appendChild(li);
  });
  if ((plan.actions || []).length === 0) {
    liste.innerHTML = `<li><span class="aucun-oubli">Aucune action prioritaire.</span></li>`;
  }

  const blocReco = document.getElementById("blocRecommandations");
  const listeReco = document.getElementById("listeReco");
  listeReco.innerHTML = "";
  if ((plan.recommandations || []).length > 0) {
    plan.recommandations.forEach((r) => {
      const li = document.createElement("li");
      li.textContent = r;
      listeReco.appendChild(li);
    });
    blocReco.hidden = false;
  } else {
    blocReco.hidden = true;
  }

  document.getElementById("resultatPlan").hidden = false;
}

// La gravité "haute/moyenne/basse" partage les classes de couleur avec les oublis.
function prioriteVersClasse(p) {
  return { haute: "haute", moyenne: "moyenne", basse: "basse" }[p] || "moyenne";
}

// --- Modales ----------------------------------------------------------------

function brancherEvenements() {
  document.getElementById("boutonPlan").addEventListener("click", genererPlan);
  document.getElementById("boutonNouveau").addEventListener("click", ouvrirModaleEquipement);

  // Modale équipement
  document.getElementById("fermerEquipement").addEventListener("click", fermerModaleEquipement);
  document.getElementById("annulerEquipement").addEventListener("click", fermerModaleEquipement);
  document.getElementById("formEquipement").addEventListener("submit", soumettreEquipement);
  document.getElementById("champType").addEventListener("change", majUniteCompteur);

  // Modale opération
  document.getElementById("fermerOperation").addEventListener("click", fermerModaleOperation);
  document.getElementById("annulerOperation").addEventListener("click", fermerModaleOperation);
  document.getElementById("formOperation").addEventListener("submit", soumettreOperation);
  document.getElementById("champCategorie").addEventListener("change", majChampLitres);
}

function ouvrirModaleEquipement() {
  document.getElementById("formEquipement").reset();
  majUniteCompteur();
  document.getElementById("modaleEquipement").hidden = false;
}
function fermerModaleEquipement() {
  document.getElementById("modaleEquipement").hidden = true;
}

function majUniteCompteur() {
  const type = document.getElementById("champType").value;
  const meta = referentiels.types.find((t) => t.cle === type);
  document.querySelectorAll(".unite-compteur").forEach((el) => {
    el.textContent = meta ? meta.compteur : "km/h";
  });
}

async function soumettreEquipement(e) {
  e.preventDefault();
  const data = formulaireVersObjet(e.target);
  const rep = await fetch("/api/equipements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (rep.ok) {
    fermerModaleEquipement();
    await chargerParc();
  } else {
    const err = await rep.json();
    alert(err.erreur || "Enregistrement impossible.");
  }
}

function ouvrirModaleOperation(eq) {
  const form = document.getElementById("formOperation");
  form.reset();
  form.elements.equipementId.value = eq.id;
  form.elements.date.value = new Date().toISOString().slice(0, 10);
  document.getElementById("operationCible").textContent = `${eq.meta.icone} ${eq.nom}`;
  majChampLitres();
  document.getElementById("modaleOperation").hidden = false;
}
function fermerModaleOperation() {
  document.getElementById("modaleOperation").hidden = true;
}

function majChampLitres() {
  const estCarburant = document.getElementById("champCategorie").value === "carburant";
  document.getElementById("champLitresWrap").hidden = !estCarburant;
}

async function soumettreOperation(e) {
  e.preventDefault();
  const data = formulaireVersObjet(e.target);
  const id = data.equipementId;
  delete data.equipementId;
  const rep = await fetch(`/api/equipements/${id}/operations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (rep.ok) {
    fermerModaleOperation();
    await chargerParc();
  } else {
    const err = await rep.json();
    alert(err.erreur || "Enregistrement impossible.");
  }
}

// --- Utilitaires ------------------------------------------------------------

function formulaireVersObjet(form) {
  const obj = {};
  new FormData(form).forEach((valeur, cle) => {
    if (valeur !== "") obj[cle] = valeur;
  });
  return obj;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
