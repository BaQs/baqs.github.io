// Construction du DOM sans innerHTML (aucune donnée ne devient du HTML) et petits formats de dates en français.

/**
 * h("div", { class: "carte", onclick: fn, style: { color: "red" } }, "texte", enfant…)
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Remplace le contenu d'un élément. */
export function render(el, ...children) {
  el.replaceChildren();
  append(el, children);
}

const FR = "fr-FR";
const hourMinute = new Intl.DateTimeFormat(FR, { hour: "2-digit", minute: "2-digit" });
const weekdayDay = new Intl.DateTimeFormat(FR, { weekday: "short", day: "numeric" });
const dayMonth = new Intl.DateTimeFormat(FR, { day: "numeric", month: "short" });
const weekdayLong = new Intl.DateTimeFormat(FR, { weekday: "long", day: "numeric", month: "long" });

export const fmt = {
  /** « 22:45 » */
  time: (ms) => hourMinute.format(ms),
  /** « lun. 12 » */
  weekdayDay: (ms) => weekdayDay.format(ms),
  /** « 12 oct. » */
  dayMonth: (ms) => dayMonth.format(ms),
  /** « lundi 12 octobre » */
  long: (ms) => weekdayLong.format(ms),
  /** « il y a 3 min », « il y a 1 h 05 » */
  ago(ms, now = Date.now()) {
    const minutes = Math.max(0, Math.floor((now - ms) / 60_000));
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    return `il y a ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
  },
  /** « 42 % » */
  pct: (x) => `${Math.round(x)} %`,
};

/** La valeur d'une variable CSS (couleurs du thème courant), pour les dessins sur canvas. */
export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
