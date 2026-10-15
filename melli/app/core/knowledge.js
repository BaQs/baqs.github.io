// « Comprendre une situation » : la base de cas de figure de la boucle fermée (situations-dt1.json, écrite par l'expert
// diabète et relue, la même que sur l'iPhone et Android) et le choix du cas qui décrit l'état présent. Portage de
// MelliCore/Knowledge.swift et de SituationsView.current. Éducatif : jamais une dose.

export const CATEGORIES = [
  ["reference", "Référence"], ["hypo", "Hypoglycémies"], ["hyper", "Hyperglycémies"], ["repas", "Repas"],
  ["effort", "Effort"], ["facteurs", "Facteurs"], ["materiel", "Matériel"],
];

/** Les tendances du déclencheur : tableau (v1.2), ou une chaîne (v1.1), ou toute tendance. */
function trendsOf(trigger) {
  if (Array.isArray(trigger.tendances)) return trigger.tendances;
  if (typeof trigger.tendance === "string") return [trigger.tendance];
  return null;
}

/** L'escalade demande d'appeler le SAMU (le booléen de la base, sinon le texte). */
export function callsEmergency(c) {
  return c.appeler_15 ?? (c.escalade?.includes("15") ?? false);
}

export function caseById(base, id) {
  return base.cas.find((c) => c.id === id) ?? null;
}

/**
 * Le cas qui décrit le mieux l'état présent : d'abord les déclencheurs de la base (plage, durée, contexte, puis
 * tendance), dans l'ordre du fichier, le premier gardé en cas d'égalité ; à défaut, le mappage de secours.
 * @param {{mgdl: number|null, stale: boolean, tendance: string, contexte: string|null, minutesInZone: number, low: number, high: number}} s
 */
export function suggestedCase(base, s) {
  if (s.mgdl === null || s.mgdl === undefined || s.stale) return caseById(base, "capteur-etats");
  const mgdl = s.mgdl;
  let best = null;
  for (const c of base.cas) {
    const t = c.declencheur;
    if (!t) continue;
    if (t.mgdl_min != null && mgdl < t.mgdl_min) continue;
    if (t.mgdl_max != null && mgdl >= t.mgdl_max) continue;
    if (t.duree_min != null && s.minutesInZone < t.duree_min) continue;
    if (t.contexte != null && t.contexte !== s.contexte) continue;
    let score = 1;
    if (t.contexte != null) score += 4;
    const trends = trendsOf(t);
    if (trends && trends.includes(s.tendance)) score += 2;
    if (t.duree_min != null) score += 5;
    if (t.mgdl_min != null && t.mgdl_max != null) score += 1;
    if (!best || score > best.score) best = { score, c };
  }
  return best ? best.c : fallback(base, mgdl, s);
}

function fallback(base, mgdl, s) {
  if (mgdl < 54) return caseById(base, "hypo-severe");
  if (mgdl < s.low) return caseById(base, s.contexte === "nuit" ? "hypo-nocturne" : "hypo-legere");
  if (mgdl > 250 && s.minutesInZone >= 60) return caseById(base, "hyper-resistante");
  if (mgdl > s.high) {
    if (s.contexte === "repas") return caseById(base, "hyper-post-repas");
    if (s.contexte === "nuit") return caseById(base, "hyper-nocturne");
    return caseById(base, "hyper-a-corriger") ?? caseById(base, "hyper-post-repas");
  }
  return caseById(base, "cible");
}

/** Une plage horaire quotidienne qui peut passer minuit (minutes depuis minuit), comme TimeWindow.contains. */
export function inWindow(window, ms) {
  const d = new Date(ms);
  const m = d.getHours() * 60 + d.getMinutes();
  if (window.start === window.end) return false;
  if (window.start < window.end) return m >= window.start && m < window.end;
  return m >= window.start || m < window.end;
}

/**
 * L'état présent dans les termes de la base. La version web ne connaît pas les repas (pas de journal de pompe) :
 * le contexte vaut « nuit » pendant les heures de nuit, sinon rien — jamais « repas ».
 */
export function currentSituation(readings, trend, { low, high, night }, now = Date.now()) {
  const last = readings[readings.length - 1] ?? null;
  const stale = !last || now - last.date > 12 * 60_000;
  const tendance = ["doubleUp", "singleUp", "fortyFiveUp"].includes(trend) ? "monte"
    : ["doubleDown", "singleDown", "fortyFiveDown"].includes(trend) ? "descend" : "plate";
  const zone = (v) => (v < low ? 0 : v <= high ? 1 : v <= 250 ? 2 : 3);
  let minutesInZone = 0;
  if (last) {
    const z = zone(last.mgdl);
    let first = last;
    for (let i = readings.length - 1; i >= 0 && zone(readings[i].mgdl) === z; i--) first = readings[i];
    minutesInZone = (now - first.date) / 60_000;
  }
  return { mgdl: last?.mgdl ?? null, stale, tendance, contexte: inWindow(night, now) ? "nuit" : null, minutesInZone, low, high };
}
