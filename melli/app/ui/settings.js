// Les réglages de la version web : la cible et l'unité (d'abord celles de l'iPhone), la source, et « oublier ».
import { format, unitLabel } from "../core/glucose.js";
import { h, render } from "./h.js";

export function mountSettings(container, app) {
  function draw() {
    const c = app.config;
    const low = h("input", { type: "number", min: "54", max: "120", step: "1", value: String(c.targetLow) });
    const high = h("input", { type: "number", min: "120", max: "300", step: "1", value: String(c.targetHigh) });
    const unit = h("select", {}, ...["mgdL", "mmolL"].map((u) => h("option", { value: u, selected: u === c.unit }, unitLabel(u))));
    const host = (() => { try { return new URL(c.nightscoutURL).host; } catch { return c.nightscoutURL; } })();
    let confirm = false;
    const forgetBox = h("div", {});
    const drawForget = () => render(forgetBox, confirm
      ? h("div", { class: "ligne" },
        h("span", { class: "sous" }, "Tout effacer de ce navigateur ?"),
        h("span", { class: "espace" }),
        h("button", { class: "bouton", onclick: () => { confirm = false; drawForget(); } }, "Annuler"),
        h("button", { class: "bouton danger", onclick: () => app.forget() }, "Effacer"))
      : h("button", { class: "bouton danger", onclick: () => { confirm = true; drawForget(); } }, "Oublier cet appareil…"));
    drawForget();
    render(container,
      h("h1", {}, "Réglages"),
      h("form", {
        class: "carte formulaire",
        onsubmit: (event) => {
          event.preventDefault();
          const l = Number(low.value), hi = Number(high.value);
          if (!(l >= 54 && hi <= 300 && l < hi)) return;
          app.saveConfig({ ...c, targetLow: l, targetHigh: hi, unit: unit.value });
        },
      },
      h("h2", {}, "Affichage"),
      h("label", {}, "Bas de la cible (mg/dL)", low),
      h("label", {}, "Haut de la cible (mg/dL)", high),
      h("label", {}, "Unité", unit),
      h("button", { class: "bouton plein", type: "submit" }, "Enregistrer"),
      h("p", { class: "sous" }, `Cible actuelle : ${format(c.targetLow, c.unit)} à ${format(c.targetHigh, c.unit)} ${unitLabel(c.unit)}.`)),
      h("section", { class: "carte" },
        h("h2", {}, "Source"),
        h("p", {}, `Nightscout · ${host}`),
        h("p", { class: "sous" }, `${c.nightscoutSecret ? "Avec un accès" : "Sans jeton"} · ${c.persistent ? "gardé sur cet appareil" : "effacé à la fermeture de l'onglet"}. Melli lit seulement : rien n'est écrit dans Nightscout, rien n'est envoyé ailleurs.`),
        h("button", { class: "bouton", onclick: () => app.startSetup() }, "Importer une autre configuration")),
      h("section", { class: "carte" },
        h("h2", {}, "Cet appareil"),
        h("p", { class: "sous" }, "Efface l'accès Nightscout et les mesures gardées dans ce navigateur."),
        forgetBox),
      h("p", { class: "sous centre" }, "Melli web · lecture seule, sans alarme · les alarmes restent sur l'iPhone."));
  }
  draw();
  return { update: () => {}, unmount: () => {} };
}
