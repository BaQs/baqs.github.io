// L'accueil : la glycémie actuelle en grand, la courbe (3 à 24 h) avec sa prévision, et le temps dans la cible du jour.
import { format, formatDelta, TREND_ARROW, TREND_LABEL, unitLabel } from "../core/glucose.js";
import { delta5, trend } from "../core/series.js";
import { glucoseStats, startOfDay } from "../core/stats.js";
import { GlucoseChart } from "./chart.js";
import { fmt, h, render } from "./h.js";

const STALE = 12 * 60_000;

export function mountHome(container, app) {
  let hours = Number(app.pref("hours", 6)) || 6;
  let last24 = app.pref("last24", "0") === "1";
  const card = h("section", { class: "current", "aria-live": "polite" });
  const chartBox = h("section", { class: "carte courbe" });
  const hoursBar = h("div", { class: "segments", role: "tablist", "aria-label": "Durée de la courbe" });
  const canvas = h("canvas", { class: "glycemie", role: "img", "aria-label": "Courbe de glycémie" });
  const legend = h("p", { class: "legende" });
  chartBox.append(hoursBar, canvas, legend);
  const today = h("section", { class: "carte" });
  render(container, card, chartBox, today);
  const chart = new GlucoseChart(canvas);

  function drawHours() {
    render(hoursBar, ...[3, 6, 12, 24].map((n) => h("button", {
      class: n === hours ? "actif" : "", role: "tab", "aria-selected": String(n === hours),
      onclick: () => { hours = n; app.setPref("hours", n); drawHours(); update(app.state); },
    }, `${n} h`)));
  }
  drawHours();

  function update(state) {
    const { readings, prediction, error, loading } = state;
    const { unit, targetLow: low, targetHigh: high, patientName } = app.config;
    const now = Date.now();
    const last = readings[readings.length - 1];
    const stale = !last || now - last.date > STALE;

    // La grande carte.
    const kind = !last ? "vide" : stale ? "perimee" : last.mgdl < low ? "basse" : last.mgdl > high ? "haute" : "cible";
    card.className = `current ${kind}`;
    const d = delta5(readings);
    const t = trend(readings);
    const next = prediction?.points[prediction.points.length - 1];
    render(card,
      h("div", { class: "current-haut" },
        h("span", { class: "prenom" }, patientName || "Melli"),
        h("span", { class: "source" }, loading ? "lecture de Nightscout…" : error ? "" : "Nightscout")),
      last ? h("div", { class: "current-valeur" },
        h("span", { class: `nombre${stale ? " barre" : ""}` }, format(last.mgdl, unit)),
        h("span", { class: "unite" }, unitLabel(unit)),
        h("span", { class: "fleche", title: TREND_LABEL[t], "aria-label": TREND_LABEL[t] }, TREND_ARROW[t]),
        h("span", { class: "details" },
          d !== null && !stale ? h("span", { class: "fort" }, `${formatDelta(d, unit)} en 5 min`) : null,
          h("span", {}, fmt.ago(last.date, now)),
          next && !stale ? h("span", { class: "fort" }, `Prévu ${format(next.value, unit)} à ${fmt.time(next.date)}`) : null))
        : h("div", { class: "current-valeur" }, h("span", { class: "nombre petit" }, loading ? "…" : "Pas de mesure")),
      error ? h("p", { class: "erreur" }, error) : null,
      stale && last ? h("p", { class: "erreur" }, `Dernière mesure ${fmt.ago(last.date, now)} : le capteur ou Nightscout ne transmet plus.`) : null,
    );

    chart.update({ readings, prediction: stale ? null : prediction, hours, low, high, unit });
    render(legend,
      h("span", { class: "pastille bande" }), ` cible ${format(low, unit)}–${format(high, unit)} · `,
      h("span", { class: "pastille prevision" }), " prévision à 30 min, par la tendance · touchez la courbe pour lire un instant");

    // Le temps dans la cible : aujourd'hui (hier tant que la journée a moins de 2 h), ou les dernières 24 h.
    const day0 = startOfDay(now);
    const todayStats = glucoseStats(readings, day0, now);
    const early = (todayStats?.count ?? 0) < 24;
    const shown = last24 ? glucoseStats(readings, now - 86_400_000, now)
      : early ? glucoseStats(readings, day0 - 86_400_000, day0) : todayStats;
    const label = last24 ? "dans la cible sur 24 h" : early ? "dans la cible hier" : "dans la cible aujourd'hui";
    render(today, shown ? [
      h("div", { class: "ligne" },
        h("span", { class: "grand" }, fmt.pct(shown.inRange)),
        h("span", { class: "sous" }, label),
        h("span", { class: "espace" }),
        h("div", { class: "segments petits" }, ...[["Auj.", false], ["24 h", true]].map(([text, value]) => h("button", {
          class: value === last24 ? "actif" : "",
          onclick: () => { last24 = value; app.setPref("last24", value ? "1" : "0"); update(app.state); },
        }, text)))),
      rangeBar(shown),
    ] : h("p", { class: "sous" }, "Pas encore assez de mesures aujourd'hui."));
  }

  return { update, unmount: () => {} };
}

/** La barre du temps dans la cible, aux couleurs de la carte heure par heure, et sa légende chiffrée. */
export function rangeBar(stats) {
  const parts = [["tres-bas", stats.veryLow], ["bas", stats.low], ["cible", stats.inRange], ["haut", stats.high], ["tres-haut", stats.veryHigh]];
  return h("div", {},
    h("div", { class: "barre-cible", role: "img", "aria-label": `${Math.round(stats.inRange)} % dans la cible` },
      ...parts.filter(([, share]) => share > 0.4).map(([kind, share]) => h("span", { class: kind, style: { flexGrow: String(share) } }))),
    h("p", { class: "sous" },
      `${Math.round(stats.veryLow + stats.low)} % sous 70 · ${Math.round(stats.high)} % de 181 à 250 · ${Math.round(stats.veryHigh)} % au-dessus de 250`));
}
