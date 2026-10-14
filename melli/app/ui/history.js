// L'historique : temps dans la cible et chiffres du consensus, profil type d'une journée, carte heure par heure.
import { format, unitLabel } from "../core/glucose.js";
import { agpBuckets, glucoseStats, hourlyHeatmap } from "../core/stats.js";
import { rangeBar } from "./home.js";
import { drawAGP } from "./chart.js";
import { fmt, h, render } from "./h.js";

const PERIODS = [[1, "24 h"], [7, "7 j"], [14, "14 j"], [30, "30 j"]];
const LEVEL_NAME = { inRange: "dans la cible", high: "au-dessus de la cible", veryHigh: "très haut", low: "sous la cible", none: "sans mesure" };

export function mountHistory(container, app) {
  let days = Number(app.pref("days", 14)) || 14;
  let expanded = false;
  const periodBar = h("div", { class: "segments", role: "tablist", "aria-label": "Période" });
  const summary = h("section", { class: "carte" });
  const agpBox = h("section", { class: "carte" });
  const agpCanvas = h("canvas", { class: "agp", role: "img", "aria-label": "Profil type d'une journée" });
  const heat = h("section", { class: "carte" });
  render(container, h("h1", {}, "Historique"), periodBar, summary, agpBox, heat);
  let agpArgs = null;
  new ResizeObserver(() => { if (agpArgs) drawAGP(agpCanvas, ...agpArgs); }).observe(agpCanvas);

  function drawPeriods() {
    render(periodBar, ...PERIODS.map(([n, label]) => h("button", {
      class: n === days ? "actif" : "", role: "tab", "aria-selected": String(n === days),
      onclick: async () => { days = n; app.setPref("days", n); drawPeriods(); await app.ensureDays(n); update(app.state); },
    }, label)));
  }
  drawPeriods();

  function update(state) {
    const { unit, targetLow: low, targetHigh: high } = app.config;
    const now = Date.now();
    const from = now - days * 86_400_000;
    const readings = state.readings.filter((r) => r.date >= from);
    const stats = glucoseStats(readings, from, now);

    render(summary, stats ? [
      h("div", { class: "tuiles" },
        tile("Dans la cible", fmt.pct(stats.inRange), "70 à 180 mg/dL"),
        tile("Moyenne", format(stats.mean, unit), unitLabel(unit)),
        tile("HbA1c estimée", `${stats.gmi.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`, "GMI"),
        tile("Variabilité", fmt.pct(stats.cv), stats.cv <= 36 ? "stable (≤ 36 %)" : "variable (> 36 %)"),
        tile("Mesures", fmt.pct(stats.coverage), `${stats.count} reçues`)),
      rangeBar(stats),
    ] : h("p", { class: "sous" }, "Aucune mesure sur cette période."));

    render(agpBox,
      h("div", { class: "ligne" }, h("h2", {}, "Profil type d'une journée"), h("span", { class: "espace" }), h("span", { class: "sous" }, days === 1 ? "24 h" : `${days} jours`)),
      agpCanvas,
      h("p", { class: "legende" }, "Ligne : médiane · bande foncée : 50 % des valeurs · bande claire : 90 %"));
    agpArgs = [agpBuckets(readings), low, high, unit];
    drawAGP(agpCanvas, ...agpArgs);

    // Heure par heure : au moins 7 jours.
    const map = hourlyHeatmap(state.readings, Math.max(days, 7), now);
    const shares = map.shares(low, high);
    const dominant = map.dominant(low, high);
    const allDays = [...map.days].reverse();
    const compressed = expanded && allDays.length > 7;
    const shownDays = compressed ? allDays : allDays.slice(0, 7);
    const pct = (k) => Math.round((shares[k] ?? 0) * 100);
    render(heat,
      h("div", { class: "ligne" }, h("h2", {}, "Heure par heure"), h("span", { class: "espace" }), h("span", { class: "sous" }, "médiane de chaque heure")),
      Object.keys(shares).length ? h("p", { class: "sous" }, h("span", { class: `case ${dominant}` }),
        ` Sur ${map.days.length} jours, surtout ${LEVEL_NAME[dominant]} : ${pct("inRange")} % des heures dans la cible, ${pct("high") + pct("veryHigh")} % au-dessus, ${pct("low")} % en dessous.`) : null,
      h("div", { class: `chaleur${compressed ? " fine" : ""}` },
        h("span", {}), ...Array.from({ length: 24 }, (_, hour) => h("span", { class: "heure" }, hour % 3 === 0 ? `${hour}h` : "")),
        ...shownDays.flatMap((d, i) => [
          h("span", { class: "jour" }, !compressed || i % 7 === 0 ? fmt.weekdayDay(d.date) : ""),
          ...d.medians.map((m, hour) => h("span", {
            class: `case ${heatClass(m, low, high)}`,
            title: m === null ? `${fmt.weekdayDay(d.date)} ${hour} h : pas de mesure` : `${fmt.weekdayDay(d.date)} ${hour} h : ${format(m, unit)} ${unitLabel(unit)}`,
          })),
        ]),
        h("span", { class: "jour fort" }, "tous"),
        ...map.dominantByHour(low, high).map((level) => h("span", { class: `case grande ${level}` }))),
      allDays.length > 7 ? h("button", { class: "lien", onclick: () => { expanded = !expanded; update(app.state); } },
        compressed ? "Revenir aux 7 derniers jours" : `Voir les ${allDays.length} jours, en lignes fines`) : null,
      h("p", { class: "legende" },
        h("span", { class: "case low" }), ` < ${format(low, unit)}  `, h("span", { class: "case inRange" }), ` ${format(low, unit)}–${format(high, unit)}  `,
        h("span", { class: "case high" }), ` ${format(high, unit)}–${format(250, unit)}  `, h("span", { class: "case veryHigh" }), ` > ${format(250, unit)}`));
  }

  return { update, unmount: () => {} };
}

function heatClass(median, low, high) {
  if (median === null) return "none";
  if (median < low) return "low";
  if (median <= high) return "inRange";
  if (median <= 250) return "high";
  return "veryHigh";
}

function tile(title, value, detail) {
  return h("div", { class: "tuile" }, h("span", { class: "sous" }, title), h("span", { class: "grand" }, value), h("span", { class: "sous" }, detail));
}
