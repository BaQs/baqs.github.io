// Melli web : lecture seule de Nightscout pour la famille, sans serveur. Les écrans se montent dans <main> selon le
// dièse de l'adresse (#accueil, #historique, #nuits, #nuit, #reglages). Nightscout est relu chaque minute tant que
// la page est visible.
import { extractConfigText } from "./core/config.js";
import { predict } from "./core/prediction.js";
import { merge } from "./core/series.js";
import { Nightscout } from "./sources/nightscout.js";
import { forget, loadConfig, loadReadings, saveConfig, saveReadings } from "./store.js";
import { h, render } from "./ui/h.js";
import { mountAdvice } from "./ui/advice.js";
import { mountHistory } from "./ui/history.js";
import { mountHome } from "./ui/home.js";
import { mountNight } from "./ui/night.js";
import { mountNights } from "./ui/nights.js";
import { mountSettings } from "./ui/settings.js";
import { mountSetup } from "./ui/setup.js";

const ROUTES = {
  accueil: { title: "Accueil", mount: mountHome },
  historique: { title: "Historique", mount: mountHistory },
  conseils: { title: "Conseils", mount: mountAdvice },
  nuits: { title: "Nuits", mount: mountNights },
  nuit: { title: "Écran de nuit", mount: mountNight, bare: true },
  reglages: { title: "Réglages", mount: mountSettings },
};
const POLL = 60_000;
const DAY = 86_400_000;

const main = document.querySelector("main");
const nav = document.querySelector("nav");

const app = {
  config: loadConfig(),
  state: { readings: [], prediction: null, error: null, loading: false, loadedDays: 0 },
  view: null,
  route: null,
  setupPrefill: "",
  timer: null,
  busy: false,

  pref(key, fallback) {
    try { return window.localStorage.getItem(`melli.web.pref.${key}`) ?? fallback; } catch { return fallback; }
  },
  setPref(key, value) {
    try { window.localStorage.setItem(`melli.web.pref.${key}`, String(value)); } catch { /* préférence perdue */ }
  },

  saveConfig(config) {
    const changedSource = !this.config || this.config.nightscoutURL !== config.nightscoutURL;
    this.config = config;
    saveConfig(config);
    if (changedSource) this.state = { readings: [], prediction: null, error: null, loading: false, loadedDays: 0 };
    else saveReadings(this.state.readings, config.persistent);
    this.setupPrefill = "";
    location.hash = "#accueil";
    this.show();
    if (changedSource) this.refresh();
  },

  forget() {
    forget();
    this.config = null;
    this.state = { readings: [], prediction: null, error: null, loading: false, loadedDays: 0 };
    location.hash = "";
    this.show();
  },

  startSetup() {
    this.config = null;
    this.show();
  },

  navigate(route) {
    location.hash = `#${route}`;
  },

  client() {
    return new Nightscout(this.config.nightscoutURL, this.config.nightscoutSecret);
  },

  /** Lit les mesures récentes (14 jours au premier passage), puis seulement les nouvelles. */
  async refresh() {
    if (!this.config || this.busy) return;
    this.busy = true;
    const readings = this.state.readings;
    const last = readings[readings.length - 1];
    const firstLoad = !last || Date.now() - last.date > 2 * DAY;
    this.state.loading = firstLoad;
    if (firstLoad) this.update();
    try {
      const fresh = firstLoad
        ? await this.client().entries({ since: Date.now() - 14 * DAY, count: 14 * 288 + 100 })
        : await this.client().entries({ since: last.date, count: 300 });
      this.state.readings = merge([...readings, ...fresh]);
      if (firstLoad) this.state.loadedDays = Math.max(this.state.loadedDays, 14);
      this.state.error = null;
      saveReadings(this.state.readings, this.config.persistent);
    } catch (e) {
      this.state.error = e?.message ?? "Lecture de Nightscout impossible.";
    } finally {
      this.busy = false;
      this.state.loading = false;
      this.state.prediction = predict(this.state.readings, Date.now());
      this.update();
    }
  },

  /** L'historique de 30 jours demande plus que les 14 jours lus au départ. */
  async ensureDays(days) {
    if (!this.config || days <= this.state.loadedDays) return;
    const first = this.state.readings[0];
    const want = Date.now() - days * DAY;
    if (first && first.date <= want + 3_600_000) { this.state.loadedDays = days; return; }
    try {
      const older = await this.client().entries({ since: want, count: days * 288 + 100 });
      this.state.readings = merge([...older, ...this.state.readings]);
      this.state.loadedDays = days;
      saveReadings(this.state.readings, this.config.persistent);
    } catch (e) {
      this.state.error = e?.message ?? "Lecture de Nightscout impossible.";
    }
  },

  update() {
    this.view?.update(this.state);
  },

  show() {
    this.view?.unmount();
    this.view = null;
    // Un lien de configuration ouvert directement (…/melli/app/#MELLI1:…) : on le garde pour la mise en route et on
    // l'efface aussitôt de l'adresse et de l'historique du navigateur.
    const linked = extractConfigText(location.hash);
    if (linked) {
      this.setupPrefill = location.hash.slice(1);
      history.replaceState(null, "", location.pathname + location.search);
      this.config = null;
    }
    if (!this.config) {
      document.title = "Melli";
      nav.hidden = true;
      this.view = mountSetup(main, this, { prefill: this.setupPrefill });
      return;
    }
    // « #conseils/hypo-legere » : un écran et son détail.
    const [name, param] = location.hash.slice(1).split("/");
    this.route = ROUTES[name] ? name : "accueil";
    const route = ROUTES[this.route];
    document.title = `${route.title} · ${this.config.patientName || "Melli"}`;
    nav.hidden = !!route.bare;
    drawNav(this.route);
    this.view = route.mount(main, this, { param: param ? decodeURIComponent(param) : null });
    this.view.update(this.state);
  },
};

function drawNav(current) {
  render(nav, ...Object.entries(ROUTES).map(([key, route]) =>
    h("a", { href: `#${key}`, class: key === current ? "actif" : "", "aria-current": key === current ? "page" : null }, route.title)));
}

function startPolling() {
  clearInterval(app.timer);
  app.timer = setInterval(() => { if (document.visibilityState === "visible") app.refresh(); }, POLL);
}

window.addEventListener("hashchange", () => app.show());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") app.refresh(); });
// Toutes les 30 s, « il y a 3 min » avance même sans nouvelle mesure.
setInterval(() => { if (document.visibilityState === "visible") app.update(); }, 30_000);

if (app.config) {
  app.state.readings = loadReadings();
  app.state.prediction = predict(app.state.readings, Date.now());
}
app.show();
app.refresh();
startPolling();
