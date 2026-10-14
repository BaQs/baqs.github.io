// Les nuits, selon les heures de nuit des réglages d'alarme : portage de la partie « mesures » de NightsView.swift.
// La version web ne lit que Nightscout : ni alarmes, ni resucrages, ni bolus de la pompe.
import { addDays, startOfDay } from "./stats.js";

/**
 * Les `count` dernières nuits, la plus récente d'abord (celle en cours comprise, jusqu'à maintenant).
 * @param {{start: number, end: number}} window minutes depuis minuit (21 h 30 → 7 h : {start: 1290, end: 420})
 */
export function nights(readings, window, count, now) {
  const length = (((window.end - window.start + 1440) % 1440) * 60_000);
  if (length <= 0) return [];
  const today = startOfDay(now);
  const result = [];
  for (let back = 0; back <= count; back++) {
    const start = addDays(today, -back) + window.start * 60_000;
    if (start >= now) continue;
    const end = Math.min(start + length, now);
    const inside = readings.filter((r) => r.date >= start && r.date <= end);
    const values = inside.map((r) => r.mgdl);
    result.push({
      start, end, readings: inside,
      minimum: values.length ? Math.min(...values) : null,
      maximum: values.length ? Math.max(...values) : null,
      /** Une mesure vaut 5 min. */
      minutesLow: values.filter((v) => v < 70).length * 5,
      minutesVeryHigh: values.filter((v) => v > 250).length * 5,
      inRange: values.length ? (values.filter((v) => v >= 70 && v <= 180).length / values.length) * 100 : null,
      ongoing: end === now && start + length > now,
    });
  }
  return result.slice(0, count);
}
