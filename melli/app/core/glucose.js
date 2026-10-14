// Unités, tendances et plages de glycémie : portage de MelliCore/Glucose.swift. Tout est stocké en mg/dL ; les
// mmol/L ne sont qu'un affichage.

export const MMOL_FACTOR = 18.0182;

const decimal1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Arrondi « au plus proche, moitié loin de zéro », comme `Double.rounded()` de Swift (Math.round arrondit −0,5 vers 0). */
export function roundHalfAway(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** @param {"mgdL"|"mmolL"} unit */
export function unitLabel(unit) {
  return unit === "mmolL" ? "mmol/L" : "mg/dL";
}

/** Valeur affichée, sans l'unité : « 142 » ou « 7,9 ». */
export function format(mgdl, unit = "mgdL") {
  if (unit === "mmolL") return decimal1.format(mgdl / MMOL_FACTOR);
  return String(roundHalfAway(mgdl));
}

/** Écart signé : « −6 » ou « +0,3 » (« ± » pour zéro). */
export function formatDelta(mgdl, unit = "mgdL") {
  const sign = mgdl > 0 ? "+" : mgdl < 0 ? "−" : "±";
  if (unit === "mmolL") return sign + decimal1.format(Math.abs(mgdl) / MMOL_FACTOR);
  return sign + String(roundHalfAway(Math.abs(mgdl)));
}

export function fromMgdl(mgdl, unit = "mgdL") {
  return unit === "mmolL" ? mgdl / MMOL_FACTOR : mgdl;
}

/** Tendance au sens Dexcom / Nightscout, depuis la chaîne `direction` de Nightscout. */
export function trendFromDirection(direction) {
  switch ((direction ?? "").toLowerCase().replaceAll(" ", "")) {
    case "doubleup": return "doubleUp";
    case "singleup": return "singleUp";
    case "fortyfiveup": return "fortyFiveUp";
    case "flat": return "flat";
    case "fortyfivedown": return "fortyFiveDown";
    case "singledown": return "singleDown";
    case "doubledown": return "doubleDown";
    default: return "unknown";
  }
}

/** Seuils Dexcom, en mg/dL par minute. */
export function trendFromRate(rate) {
  if (rate >= 3) return "doubleUp";
  if (rate >= 2) return "singleUp";
  if (rate >= 1) return "fortyFiveUp";
  if (rate >= -1) return "flat";
  if (rate >= -2) return "fortyFiveDown";
  if (rate >= -3) return "singleDown";
  return "doubleDown";
}

export const TREND_ARROW = {
  doubleUp: "↑↑", singleUp: "↑", fortyFiveUp: "↗", flat: "→", fortyFiveDown: "↘", singleDown: "↓", doubleDown: "↓↓", unknown: "?",
};

export const TREND_LABEL = {
  doubleUp: "monte très vite", singleUp: "monte vite", fortyFiveUp: "monte", flat: "stable",
  fortyFiveDown: "baisse", singleDown: "baisse vite", doubleDown: "baisse très vite", unknown: "tendance inconnue",
};

/** Plages de référence du consensus international : < 54, < 70, ≤ 180, ≤ 250, au-delà. */
export function glucoseRange(mgdl) {
  if (mgdl < 54) return "veryLow";
  if (mgdl < 70) return "low";
  if (mgdl <= 180) return "inRange";
  if (mgdl <= 250) return "high";
  return "veryHigh";
}

/**
 * Une mesure : date en millisecondes (comme Nightscout), valeur en mg/dL, tendance.
 * @typedef {{ date: number, mgdl: number, trend: string, device?: string }} Reading
 */
