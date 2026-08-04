const chargement = document.getElementById("chargement");
const messageChargement = document.getElementById("messageChargement");
const carteErreur = document.getElementById("carteErreur");
const messageErreur = document.getElementById("messageErreur");
const zoneRapport = document.getElementById("rapport");
const zoneReponse = document.getElementById("reponse");
const champQuestion = document.getElementById("champQuestion");

const euros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// --- Tableau de bord (KPI déterministes) -----------------------------------

async function chargerTableauDeBord() {
  try {
    const rep = await fetch("/api/direction/tableau-de-bord");
    const data = await rep.json();
    if (!rep.ok) throw new Error(data.erreur || "Erreur inconnue.");
    document.getElementById("exercice").textContent = data.exercice;
    rendreKpi(data.kpi);
  } catch (err) {
    afficherErreur(err.message);
  }
}

function rendreKpi(kpi) {
  const cartes = [
    { libelle: "Chiffre d'affaires facturé", valeur: euros.format(kpi.chiffreAffairesFacture) },
    { libelle: "Carnet de commandes", valeur: euros.format(kpi.carnetCommandes) },
    { libelle: "Marge estimée globale", valeur: euros.format(kpi.margeEstimeeGlobale) },
    { libelle: "Taux de marge", valeur: pct(kpi.tauxMargeGlobal) },
    { libelle: "Projets actifs", valeur: kpi.nbProjetsActifs },
    { libelle: "Projets déficitaires", valeur: kpi.nbProjetsDeficitaires, alerte: kpi.nbProjetsDeficitaires > 0 },
    { libelle: "Encours non encaissé", valeur: euros.format(kpi.encoursNonEncaisse) },
    { libelle: "Risques ouverts", valeur: kpi.nbRisquesOuverts },
  ];
  const grille = document.getElementById("kpiGrille");
  grille.innerHTML = "";
  for (const c of cartes) {
    const div = document.createElement("div");
    div.className = "kpi" + (c.alerte ? " kpi-alerte" : "");
    div.innerHTML = `<span class="kpi-valeur">${c.valeur}</span><span class="kpi-libelle">${escapeHtml(
      c.libelle
    )}</span>`;
    grille.appendChild(div);
  }
}

// --- Rapports IA ------------------------------------------------------------

document.querySelectorAll("[data-periode]").forEach((btn) => {
  btn.addEventListener("click", () => demanderRapport(btn.dataset.periode));
});

async function demanderRapport(periode) {
  debut(`Production du rapport ${periode}…`);
  try {
    const rep = await fetch("/api/direction/rapport", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periode }),
    });
    const data = await rep.json();
    if (!rep.ok) throw new Error(data.erreur || "Erreur inconnue.");
    rendreRapport(data.rapport);
  } catch (err) {
    afficherErreur(err.message);
  } finally {
    fin();
  }
}

function rendreRapport(r) {
  const kpis = (r.kpis || [])
    .map(
      (k) => `
      <div class="kpi">
        <span class="kpi-valeur">${escapeHtml(k.valeur)}</span>
        <span class="kpi-libelle">${escapeHtml(k.libelle)} <em class="tendance ${k.tendance}">${escapeHtml(
        k.tendance
      )}</em></span>
        <span class="kpi-commentaire">${escapeHtml(k.commentaire)}</span>
      </div>`
    )
    .join("");

  const problemes = (r.problemesPrioritaires || [])
    .map(
      (p) => `
      <li class="${escapeHtml(p.gravite)}">
        <div class="oubli-titre">
          <strong>${escapeHtml(p.titre)}</strong>
          <span class="badge ${escapeHtml(p.gravite)}">${escapeHtml(p.gravite)}</span>
        </div>
        <p class="oubli-justif">${escapeHtml(p.impact)}</p>
        ${
          (p.projetsConcernes || []).length
            ? `<p class="tags">${p.projetsConcernes
                .map((x) => `<span class="tag">${escapeHtml(x)}</span>`)
                .join("")}</p>`
            : ""
        }
      </li>`
    )
    .join("");

  const risques = (r.risquesMajeurs || [])
    .map(
      (x) => `
      <li class="${escapeHtml(x.gravite)}">
        <div class="oubli-titre">
          <strong>${escapeHtml(x.projet)}</strong>
          <span class="badge ${escapeHtml(x.gravite)}">${escapeHtml(x.gravite)}</span>
        </div>
        <p class="oubli-justif">${escapeHtml(x.description)}</p>
        <p class="action">➜ ${escapeHtml(x.actionRecommandee)}</p>
      </li>`
    )
    .join("");

  const decisions = (r.decisions || [])
    .map(
      (d) => `
      <li>
        <div class="oubli-titre">
          <strong>${escapeHtml(d.decision)}</strong>
          <span class="badge urgence-${escapeHtml(d.urgence)}">${escapeHtml(d.urgence)}</span>
        </div>
        <p class="oubli-justif">${escapeHtml(d.justification)}</p>
      </li>`
    )
    .join("");

  zoneRapport.innerHTML = `
    <div class="bloc-rapport">
      <p class="periode-rapport">${escapeHtml(r.periode || "")}</p>
      <p class="synthese-controle">${escapeHtml(r.syntheseExecutive || "")}</p>
      ${kpis ? `<div class="kpi-grille">${kpis}</div>` : ""}
      ${
        problemes
          ? `<h3>Problèmes prioritaires</h3><ul class="liste-oublis">${problemes}</ul>`
          : ""
      }
      ${risques ? `<h3>Risques majeurs</h3><ul class="liste-oublis">${risques}</ul>` : ""}
      ${
        decisions
          ? `<h3>Décisions proposées</h3><ul class="liste-oublis liste-decisions">${decisions}</ul>`
          : ""
      }
      ${r.conclusion ? `<p class="conclusion">${escapeHtml(r.conclusion)}</p>` : ""}
    </div>`;
  zoneRapport.hidden = false;
  zoneRapport.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// --- Questions libres -------------------------------------------------------

document.querySelectorAll("#exemples .puce").forEach((btn) => {
  btn.addEventListener("click", () => {
    champQuestion.value = btn.textContent.trim();
    poserQuestion();
  });
});

document.getElementById("boutonQuestion").addEventListener("click", poserQuestion);
champQuestion.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) poserQuestion();
});

async function poserQuestion() {
  const question = champQuestion.value.trim();
  if (!question) return;
  debut("Le Directeur général IA réfléchit…");
  try {
    const rep = await fetch("/api/direction/question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await rep.json();
    if (!rep.ok) throw new Error(data.erreur || "Erreur inconnue.");
    rendreReponse(data);
  } catch (err) {
    afficherErreur(err.message);
  } finally {
    fin();
  }
}

function rendreReponse({ question, reponse }) {
  const points = (reponse.pointsCles || [])
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join("");
  const donnees = (reponse.donneesAppui || [])
    .map(
      (d) =>
        `<div class="donnee"><span>${escapeHtml(d.libelle)}</span><strong>${escapeHtml(
          d.valeur
        )}</strong></div>`
    )
    .join("");
  const recos = (reponse.recommandations || [])
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join("");

  zoneReponse.innerHTML = `
    <div class="bloc-rapport">
      <p class="question-posee">« ${escapeHtml(question)} »</p>
      <p class="synthese-controle">${escapeHtml(reponse.reponse || "")}</p>
      ${points ? `<h3>Points clés</h3><ul class="puces">${points}</ul>` : ""}
      ${donnees ? `<h3>Données d'appui</h3><div class="donnees-appui">${donnees}</div>` : ""}
      ${recos ? `<h3>Recommandations</h3><ul class="puces">${recos}</ul>` : ""}
    </div>`;
  zoneReponse.hidden = false;
  zoneReponse.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// --- Utilitaires UI ---------------------------------------------------------

function debut(message) {
  carteErreur.hidden = true;
  messageChargement.textContent = message;
  chargement.hidden = false;
}

function fin() {
  chargement.hidden = true;
}

function afficherErreur(message) {
  messageErreur.textContent = message;
  carteErreur.hidden = false;
}

function pct(x) {
  return `${Math.round((x || 0) * 100)} %`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

chargerTableauDeBord();
