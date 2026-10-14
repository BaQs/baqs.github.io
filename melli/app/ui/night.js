// L'écran de nuit : noir, la glycémie en très grand, en orange sombre qui n'éblouit pas, et la courbe des dernières
// heures. Il peut garder l'écran allumé tant qu'il est ouvert. Ce n'est pas une alarme : un navigateur ne réveille
// personne de façon sûre (onglet endormi, ordinateur en veille).
import { format, formatDelta, TREND_ARROW, unitLabel } from "../core/glucose.js";
import { delta5, trend } from "../core/series.js";
import { GlucoseChart } from "./chart.js";
import { fmt, h, render } from "./h.js";

export function mountNight(container, app) {
  let hours = Number(app.pref("nightHours", 3)) || 3;
  let wakeLock = null;
  /** Demandé par l'utilisateur : redemandé au retour de l'onglet (le navigateur le relâche en arrière-plan). */
  let wantAwake = false;
  const head = h("div", { class: "nuit-haut" });
  const value = h("div", { class: "nuit-valeur" });
  const meta = h("p", { class: "nuit-meta" });
  const hoursBar = h("div", { class: "segments sombres" });
  const canvas = h("canvas", { class: "glycemie nuit-courbe", role: "img", "aria-label": "Courbe de glycémie" });
  const foot = h("div", { class: "nuit-bas" });
  const screen = h("div", { class: "ecran-nuit" }, head, value, meta, hoursBar, canvas, foot);
  render(container, screen);
  document.body.classList.add("mode-nuit");
  const chart = new GlucoseChart(canvas, { night: true });

  async function keepAwake(on) {
    wantAwake = on;
    try {
      if (on && "wakeLock" in navigator) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; drawFoot(); });
      } else if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch { wakeLock = null; }
    drawFoot();
  }

  function drawFoot() {
    render(foot,
      "wakeLock" in navigator ? h("button", { class: "bouton sombre", onclick: () => keepAwake(!wakeLock) },
        wakeLock ? "Écran gardé allumé · relâcher" : "Garder l'écran allumé") : null,
      h("button", { class: "bouton sombre", onclick: () => app.navigate("accueil") }, "Quitter l'écran de nuit"),
      h("p", { class: "nuit-avertissement" }, "Ce n'est pas une alarme : seule l'app iPhone peut réveiller. Le navigateur peut s'endormir sans prévenir."));
  }

  function drawHours() {
    render(hoursBar, ...[2, 3, 6, 9, 12].map((n) => h("button", {
      class: n === hours ? "actif" : "", onclick: () => { hours = n; app.setPref("nightHours", n); drawHours(); update(app.state); },
    }, `${n} h`)));
  }
  drawHours();
  drawFoot();

  // L'écran gardé allumé se relâche quand l'onglet passe en arrière-plan : on le redemande au retour.
  const onVisible = () => { if (document.visibilityState === "visible" && wakeLock === null && wantAwake) keepAwake(true); };
  document.addEventListener("visibilitychange", onVisible);

  function update(state) {
    const { readings, prediction } = state;
    const { unit, targetLow: low, targetHigh: high, patientName } = app.config;
    const now = Date.now();
    const last = readings[readings.length - 1];
    const stale = !last || now - last.date > 12 * 60_000;
    render(head, h("span", {}, "● ", patientName || "Melli"), h("span", {}, fmt.time(now)));
    render(value, last ? [h("span", { class: stale ? "barre" : "" }, format(last.mgdl, unit)), h("span", { class: "nuit-fleche" }, TREND_ARROW[trend(readings)])] : "—");
    const d = delta5(readings);
    const next = prediction?.points[prediction.points.length - 1];
    render(meta, last ? `${unitLabel(unit)} · ${d !== null && !stale ? `${formatDelta(d, unit)} en 5 min · ` : ""}${fmt.ago(last.date, now)}`
      + (next && !stale ? ` · prévu ${format(next.value, unit)} vers ${fmt.time(next.date)}` : "") : "Pas de mesure");
    chart.update({ readings, prediction: stale ? null : prediction, hours, low, high, unit });
  }

  return {
    update,
    unmount: () => {
      document.body.classList.remove("mode-nuit");
      document.removeEventListener("visibilitychange", onVisible);
      keepAwake(false);
    },
  };
}
