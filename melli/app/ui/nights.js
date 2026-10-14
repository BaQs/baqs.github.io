// Les nuits, selon les heures de nuit de l'iPhone : chacune en miniature, avec son plus bas et ses minutes sous 70.
import { format, unitLabel } from "../core/glucose.js";
import { nights } from "../core/nights.js";
import { drawSpark } from "./chart.js";
import { fmt, h, render } from "./h.js";

export function mountNights(container, app) {
  const list = h("div", { class: "nuits" });
  const intro = h("p", { class: "sous" });
  render(container, h("h1", {}, "Nuits"), intro, list);
  const sparks = [];
  const observer = new ResizeObserver(() => sparks.forEach((s) => drawSpark(...s)));

  function update(state) {
    const { unit, targetLow: low, targetHigh: high, night } = app.config;
    const now = Date.now();
    const items = nights(state.readings, night, 14, now).filter((n) => n.readings.length > 0);
    const hm = (m) => `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
    render(intro, `De ${hm(night.start)} à ${hm(night.end)}, les heures de nuit des alarmes de l'iPhone. La version web ne voit ni les alarmes ni les resucrages : seulement la glycémie.`);
    sparks.length = 0;
    observer.disconnect();
    render(list, items.length ? items.map((n) => {
      const canvas = h("canvas", { class: "mini", role: "img", "aria-label": `Glycémie de la nuit du ${fmt.long(n.start)}` });
      sparks.push([canvas, n.readings, n.start, n.start + ((night.end - night.start + 1440) % 1440) * 60_000, low, high]);
      observer.observe(canvas);
      return h("article", { class: "carte nuit-ligne" },
        h("div", { class: "ligne" },
          h("h2", {}, n.ongoing ? "Cette nuit" : `Nuit du ${fmt.weekdayDay(n.start)}`),
          h("span", { class: "espace" }),
          h("span", { class: "sous" }, `${fmt.time(n.start)} → ${n.ongoing ? "maintenant" : fmt.time(n.end)}`)),
        canvas,
        h("div", { class: "chiffres" },
          figure("plus bas", n.minimum === null ? "—" : `${format(n.minimum, unit)} ${unitLabel(unit)}`, n.minimum !== null && n.minimum < 70 ? "basse" : ""),
          figure("sous 70", n.minutesLow ? `${n.minutesLow} min` : "0", n.minutesLow ? "basse" : ""),
          figure("dans la cible", n.inRange === null ? "—" : fmt.pct(n.inRange), ""),
          figure("au-dessus de 250", n.minutesVeryHigh ? `${n.minutesVeryHigh} min` : "0", n.minutesVeryHigh ? "haute" : "")));
    }) : h("p", { class: "sous" }, "Pas encore de nuit mesurée."));
    requestAnimationFrame(() => sparks.forEach((s) => drawSpark(...s)));
  }

  return { update, unmount: () => observer.disconnect() };
}

function figure(label, value, kind) {
  return h("div", { class: "chiffre" }, h("span", { class: `valeur ${kind}` }, value), h("span", { class: "sous" }, label));
}
