const selecteurAgents = document.getElementById("selecteurAgents");
const champContexte = document.getElementById("contexte");
const champQuestion = document.getElementById("question");
const exemplesBox = document.getElementById("exemples");
const boutonEnvoyer = document.getElementById("boutonEnvoyer");
const chargement = document.getElementById("chargement");
const messageChargement = document.getElementById("messageChargement");
const carteErreur = document.getElementById("carteErreur");
const messageErreur = document.getElementById("messageErreur");
const reponse = document.getElementById("reponse");
const reponseContenu = document.getElementById("reponseContenu");
const organigramme = document.getElementById("organigramme");
const banniereStatut = document.getElementById("banniereStatut");

let agents = [];
let agentSelectionne = "dg";

// --- Statut du moteur d'IA --------------------------------------------------

async function chargerStatut() {
  try {
    const rep = await fetch("/api/agents/statut");
    const s = await rep.json();
    banniereStatut.hidden = false;
    banniereStatut.classList.toggle("ok", s.pret);
    banniereStatut.classList.toggle("attention", !s.pret);
    const moteur =
      s.provider === "ollama"
        ? `IA locale gratuite (Ollama · ${s.modele})`
        : `Claude (${s.modele})`;
    banniereStatut.innerHTML = s.pret
      ? `<strong>✅ Moteur prêt :</strong> ${escapeHtml(moteur)}.`
      : `<strong>⚠️ Moteur non prêt :</strong> ${escapeHtml(moteur)}.<br>${escapeHtml(s.message)}`;
  } catch {
    // Silencieux : le statut est indicatif.
  }
}

// --- Chargement des agents --------------------------------------------------

async function chargerAgents() {
  const rep = await fetch("/api/agents");
  const data = await rep.json();
  agents = data.agents || [];
  rendreSelecteur();
  rendreOrganigramme();
  majExemples();
}

function agentPar(id) {
  return agents.find((a) => a.id === id);
}

function rendreSelecteur() {
  selecteurAgents.innerHTML = "";
  agents.forEach((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "puce-agent" + (a.id === agentSelectionne ? " actif" : "");
    btn.dataset.id = a.id;
    if (a.id === "dg") btn.classList.add("puce-dg");
    btn.innerHTML = `<span class="puce-emoji">${a.emoji}</span> ${escapeHtml(a.nom)}`;
    btn.title = a.mission;
    btn.addEventListener("click", () => {
      agentSelectionne = a.id;
      rendreSelecteur();
      majExemples();
    });
    selecteurAgents.appendChild(btn);
  });
}

function majExemples() {
  const a = agentPar(agentSelectionne);
  exemplesBox.innerHTML = "";
  if (!a || !a.exemples) return;
  const titre = document.createElement("span");
  titre.className = "exemples-titre";
  titre.textContent = "Exemples :";
  exemplesBox.appendChild(titre);
  a.exemples.forEach((ex) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "exemple-chip";
    chip.textContent = ex;
    chip.addEventListener("click", () => {
      champQuestion.value = ex;
      champQuestion.focus();
    });
    exemplesBox.appendChild(chip);
  });
}

// --- Envoi de la question ---------------------------------------------------

boutonEnvoyer.addEventListener("click", envoyer);
champQuestion.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) envoyer();
});

async function envoyer() {
  const question = champQuestion.value.trim();
  if (!question) {
    champQuestion.focus();
    return;
  }
  const contexte = champContexte.value.trim();
  const a = agentPar(agentSelectionne);

  carteErreur.hidden = true;
  reponse.hidden = true;
  chargement.hidden = false;
  messageChargement.textContent =
    agentSelectionne === "dg"
      ? "Le Directeur général consulte les agents concernés…"
      : `${a ? a.nom : "L'agent"} analyse la question…`;
  boutonEnvoyer.disabled = true;

  const url =
    agentSelectionne === "dg" ? "/api/dg" : `/api/agents/${agentSelectionne}`;

  try {
    const rep = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, contexte }),
    });
    const data = await rep.json();
    if (!rep.ok) throw new Error(data.erreur || "Erreur inconnue.");
    afficherReponse(data);
  } catch (err) {
    messageErreur.textContent = err.message;
    carteErreur.hidden = false;
  } finally {
    chargement.hidden = true;
    boutonEnvoyer.disabled = false;
  }
}

// --- Affichage de la réponse ------------------------------------------------

function afficherReponse(data) {
  reponseContenu.innerHTML = "";

  const entete = document.createElement("div");
  entete.className = "reponse-entete";
  const a = agentPar(data.agent);
  entete.innerHTML = `<span class="reponse-emoji">${a ? a.emoji : "🤖"}</span>
    <h2>${escapeHtml(data.nom || "Réponse")}</h2>`;
  reponseContenu.appendChild(entete);

  if (data.agent === "dg") {
    afficherReponseDG(data);
  } else {
    afficherReponseAgent(data);
  }

  reponse.hidden = false;
  reponse.scrollIntoView({ behavior: "smooth", block: "start" });
}

function afficherReponseDG(data) {
  const synth = document.createElement("div");
  synth.className = "bloc-synthese";
  synth.innerHTML = formaterTexte(data.reponse || "");
  reponseContenu.appendChild(synth);

  if (data.consultations && data.consultations.length) {
    const titre = document.createElement("h3");
    titre.className = "titre-consultations";
    titre.textContent = `Agents consultés (${data.consultations.length})`;
    reponseContenu.appendChild(titre);

    data.consultations.forEach((c) => {
      const det = document.createElement("details");
      det.className = "consultation";
      const a = agentPar(c.agent);
      det.innerHTML = `
        <summary>
          <span class="puce-emoji">${a ? a.emoji : "🤖"}</span>
          <strong>${escapeHtml(c.nom)}</strong>
          <span class="consultation-q">${escapeHtml(c.question)}</span>
        </summary>`;
      const corps = document.createElement("div");
      corps.className = "consultation-corps";
      corps.appendChild(rendreCorpsAgent(c.reponse));
      det.appendChild(corps);
      reponseContenu.appendChild(det);
    });
  }
}

function afficherReponseAgent(data) {
  reponseContenu.appendChild(rendreCorpsAgent(data));
}

/** Construit le rendu détaillé d'une réponse d'agent structurée. */
function rendreCorpsAgent(r) {
  const wrap = document.createElement("div");
  wrap.className = "corps-agent";
  if (!r) return wrap;

  if (r.synthese) {
    const s = document.createElement("p");
    s.className = "agent-synthese";
    s.textContent = r.synthese;
    wrap.appendChild(s);
  }

  if (r.analyse) {
    const a = document.createElement("div");
    a.className = "agent-analyse";
    a.innerHTML = formaterTexte(r.analyse);
    wrap.appendChild(a);
  }

  if (r.pointsCles && r.pointsCles.length) {
    wrap.appendChild(bloc("Points clés", liste(r.pointsCles)));
  }

  if (r.alertes && r.alertes.length) {
    const ul = document.createElement("ul");
    ul.className = "liste-alertes";
    r.alertes.forEach((al) => {
      const li = document.createElement("li");
      li.classList.add(al.niveau || "moyenne");
      li.innerHTML = `<span class="badge ${al.niveau || "moyenne"}">${al.niveau || "moyenne"}</span>
        <span>${escapeHtml(al.message)}</span>`;
      ul.appendChild(li);
    });
    wrap.appendChild(bloc("Alertes", ul));
  }

  if (r.recommandations && r.recommandations.length) {
    wrap.appendChild(bloc("Recommandations", liste(r.recommandations)));
  }

  if (r.donneesManquantes && r.donneesManquantes.length) {
    wrap.appendChild(bloc("Données manquantes", liste(r.donneesManquantes)));
  }

  return wrap;
}

function bloc(titre, elementListe) {
  const div = document.createElement("div");
  div.className = "sous-bloc";
  const h = document.createElement("h4");
  h.textContent = titre;
  div.appendChild(h);
  div.appendChild(elementListe);
  return div;
}

function liste(items) {
  const ul = document.createElement("ul");
  ul.className = "liste-simple";
  items.forEach((it) => {
    const li = document.createElement("li");
    li.textContent = it;
    ul.appendChild(li);
  });
  return ul;
}

// --- Organigramme -----------------------------------------------------------

function rendreOrganigramme() {
  organigramme.innerHTML = "";
  const dg = agentPar("dg");
  if (dg) organigramme.appendChild(noeud(dg, true));

  const enfants = document.createElement("div");
  enfants.className = "orga-enfants";
  agents
    .filter((a) => a.id !== "dg")
    .forEach((a) => enfants.appendChild(noeud(a, false)));
  organigramme.appendChild(enfants);
}

function noeud(a, estDg) {
  const div = document.createElement("div");
  div.className = "orga-noeud" + (estDg ? " orga-dg" : "");
  const rattache = a.rattachement ? agentPar(a.rattachement) : null;
  div.innerHTML = `
    <div class="orga-tete">
      <span class="puce-emoji">${a.emoji}</span>
      <strong>${escapeHtml(a.nom)}</strong>
      <span class="orga-etoiles">${"★".repeat(a.priorite)}</span>
    </div>
    <p class="orga-mission">${escapeHtml(a.mission)}</p>
    ${rattache ? `<p class="orga-rattache">↳ rattaché à ${escapeHtml(rattache.nom)}</p>` : ""}
    <p class="orga-sources">${a.sources.map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("")}</p>`;
  div.addEventListener("click", () => {
    agentSelectionne = a.id;
    rendreSelecteur();
    majExemples();
    document.querySelector(".selecteur-agents").scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });
  return div;
}

// --- Utilitaires ------------------------------------------------------------

function formaterTexte(txt) {
  // Rendu léger : paragraphes + listes à puces markdown simples.
  const lignes = String(txt || "").split("\n");
  let html = "";
  let dansListe = false;
  for (const ligne of lignes) {
    const l = ligne.trim();
    if (/^[-*•]\s+/.test(l)) {
      if (!dansListe) {
        html += "<ul>";
        dansListe = true;
      }
      html += `<li>${escapeHtml(l.replace(/^[-*•]\s+/, ""))}</li>`;
    } else {
      if (dansListe) {
        html += "</ul>";
        dansListe = false;
      }
      if (l) html += `<p>${escapeHtml(l)}</p>`;
    }
  }
  if (dansListe) html += "</ul>";
  return html;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

chargerStatut();
chargerAgents().catch((err) => {
  messageErreur.textContent =
    "Impossible de charger les agents : " + err.message;
  carteErreur.hidden = false;
});
