// Opérations sur une série de mesures triée par date croissante : portage de MelliCore/Series.swift.
import { trendFromRate } from "./glucose.js";

/** Tri par date, et deux mesures à moins de `windowMs` l'une de l'autre n'en font qu'une (la plus récente gagne). */
export function merge(readings, windowMs = 120_000) {
  const sorted = readings.filter((r) => r.mgdl >= 20 && r.mgdl <= 600).sort((a, b) => a.date - b.date);
  const result = [];
  for (const r of sorted) {
    const last = result[result.length - 1];
    if (last && r.date - last.date < windowMs) {
      if (r.date > last.date) result[result.length - 1] = r;
      continue;
    }
    result.push(r);
  }
  return result;
}

/** Dernière mesure si elle a moins de `maxAgeMs`. */
export function latestFresh(readings, now, maxAgeMs = 12 * 60_000) {
  const last = readings[readings.length - 1];
  return last && now - last.date <= maxAgeMs ? last : null;
}

/** Écart entre les deux dernières mesures ramené à 5 min exactement ; nul si elles sont à moins de 2 ou plus de 15 min. */
export function delta5(readings) {
  if (readings.length < 2) return null;
  const last = readings[readings.length - 1];
  const previous = readings[readings.length - 2];
  const minutes = (last.date - previous.date) / 60_000;
  if (minutes < 2 || minutes > 15) return null;
  return ((last.mgdl - previous.mgdl) / minutes) * 5;
}

/** Tendance de la dernière mesure : celle de la source, sinon calculée. */
export function trend(readings) {
  const last = readings[readings.length - 1];
  if (!last) return "unknown";
  if (last.trend && last.trend !== "unknown") return last.trend;
  const d = delta5(readings);
  return d === null ? "unknown" : trendFromRate(d / 5);
}

export function window(readings, from, to) {
  return readings.filter((r) => r.date >= from && r.date <= to);
}
