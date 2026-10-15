// Les conseils, version web : « Comprendre une situation » (la base des cas de figure, avec celui qui colle à l'état
// présent en tête) et les constats de la période tirés des seules glycémies. Les conseils de réglage de la pompe
// (ratios, facteur de correction, cible) demandent son journal (Glooko) : ils restent sur l'iPhone.
import { periodFindings } from "../core/advice.js";
import { CATEGORIES, callsEmergency, caseById, currentSituation, suggestedCase } from "../core/knowledge.js";
import { trend } from "../core/series.js";
import { h, render } from "./h.js";

let basePromise = null;
/** La base embarquée, chargée une fois. */
export function loadBase() {
  basePromise ??= fetch(new URL("data/situations-dt1.json", document.baseURI), { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .catch((e) => { basePromise = null; throw e; });
  return basePromise;
}

const PERIODS = [[7, "7 j"], [14, "14 j"], [30, "30 j"]];

export function mountAdvice(container, app, { param = null } = {}) {
  let days = Number(app.pref("adviceDays", 14)) || 14;
  let base = null;
  let failed = false;
  render(container, h("p", { class: "sous" }, "Chargement…"));
  loadBase().then((b) => { base = b; update(app.state); }).catch(() => { failed = true; update(app.state); });

  function update(state) {
    if (failed) { render(container, h("h1", {}, "Conseils"), h("p", { class: "erreur" }, "La base des situations n'a pas pu être lue.")); return; }
    if (!base) return;
    if (param) {
      const item = caseById(base, param);
      if (item) { renderDetail(container, item, base.meta); return; }
    }
    const { targetLow: low, targetHigh: high, night } = app.config;
    const now = Date.now();
    const current = suggestedCase(base, currentSituation(state.readings, trend(state.readings), { low, high, night }, now));
    const findings = periodFindings(state.readings, { low, high }, days, now);
    const periodBar = h("div", { class: "segments", role: "tablist", "aria-label": "Période" }, ...PERIODS.map(([n, label]) => h("button", {
      class: n === days ? "actif" : "", role: "tab", "aria-selected": String(n === days),
      onclick: async () => { days = n; app.setPref("adviceDays", n); await app.ensureDays(n); update(app.state); },
    }, label)));

    render(container,
      h("h1", {}, "Conseils"),
      h("section", { class: "carte" },
        h("h2", {}, "Comprendre une situation"),
        h("p", { class: "sous" }, "Hypo, hyper après un repas, effort, maladie, capteur… ce qui se passe et ce que fait la boucle."),
        current ? h("div", { class: "en-ce-moment" }, h("span", { class: "sous fort" }, "En ce moment"), caseRow(current, true)) : null,
        ...CATEGORIES.map(([key, label]) => {
          const items = base.cas.filter((c) => c.categorie === key);
          return items.length ? h("div", { class: "categorie" }, h("h3", {}, label), ...items.map((c) => caseRow(c, false))) : null;
        })),
      periodBar,
      h("section", { class: "carte" },
        h("h2", {}, "Sur la période"),
        findings.length ? findings.map((f) => h("div", { class: "constat" }, h("p", { class: "fort" }, f.title), h("p", { class: "sous" }, f.detail)))
          : h("p", { class: "sous" }, "Pas encore assez de mesures sur la période (il en faut 100).")),
      h("section", { class: "carte" },
        h("h2", {}, "Réglages de la pompe"),
        h("p", {}, "Les conseils sur les ratios, le facteur de correction et la cible comparent les repas, les bolus et les réglages de la pompe aux glycémies. Ils ont besoin du journal de la pompe (Glooko), que la version web ne lit pas : ils sont sur l'iPhone, onglet Conseils.")),
      h("section", { class: "carte" },
        h("h2", {}, "À voir avec l'équipe soignante"),
        ...base.orientations.map((o) => h("div", { class: "constat" }, h("p", { class: "fort" }, o.titre), h("p", { class: "sous" }, o.message)))),
      h("p", { class: "sous centre" }, "Melli ne modifie aucun réglage et ne donne jamais de dose. ", base.meta.statut),
      h("p", { class: "sous centre" }, `Version ${base.meta.version} · ${base.meta.date}`));
  }

  return { update, unmount: () => {} };
}

function caseRow(c, highlight) {
  return h("a", { class: `cas${highlight ? " actuel" : ""}`, href: `#conseils/${encodeURIComponent(c.id)}` },
    h("span", { class: "cas-titre" }, c.titre, callsEmergency(c) ? h("span", { class: "urgence", title: "Peut demander d'appeler le 15" }, " ⚠") : null),
    h("span", { class: "sous" }, c.phrase_type));
}

function renderDetail(container, item, meta) {
  const section = (title, ...content) => h("section", { class: "carte" }, h("h2", {}, title), ...content);
  render(container,
    h("a", { class: "lien", href: "#conseils" }, "← Comprendre une situation"),
    h("h1", {}, item.titre),
    h("section", { class: "carte" }, h("p", { class: "phrase" }, item.phrase_type)),
    item.escalade ? h("section", { class: "carte escalade" },
      h("h2", {}, "Quand s'inquiéter"),
      h("p", { class: "fort" }, item.escalade),
      callsEmergency(item) ? h("a", { class: "bouton plein urgence-bouton", href: "tel:15" }, "Appeler le 15") : null) : null,
    section("La situation", h("p", {}, item.situation)),
    section("Ce qui se passe dans le corps", h("p", {}, item.physio)),
    section("Ce que fait la boucle", h("p", {}, item.aid)),
    section("Ce que Melli recommande", h("ul", {}, ...item.playbook.map((line) => h("li", {}, line)))),
    section("Repères", h("p", {}, item.seuils)),
    h("p", { class: "sous centre" }, `Melli ne donne jamais de dose : c'est la pompe qui calcule. Tout changement de réglage se décide avec le diabétologue. ${meta.statut}`));
  window.scrollTo?.(0, 0);
}
