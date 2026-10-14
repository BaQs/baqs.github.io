// Prévision à 30 min par la tendance : portage du chemin « tendance seule » de MelliCore/Prediction.swift
// (régression linéaire pondérée sur les 25 dernières minutes, ancrée sur la dernière mesure). La version web ne lit que
// Nightscout : pas d'insuline ni de glucides connus, donc pas du modèle d'insuline.

export const OPTIONS = { lookbackMinutes: 25, horizonMinutes: 30, stepMinutes: 5, maxAgeMinutes: 12, maxSlope: 4 };

/** Régression pondérée : t en minutes (négatif dans le passé), poids exp(t / 12) ; pente plafonnée, dispersion. */
export function regression(recent, last, maxSlope) {
  let sw = 0, st = 0, sv = 0, stt = 0, stv = 0;
  for (const r of recent) {
    const t = (r.date - last.date) / 60_000;
    const w = Math.exp(t / 12);
    sw += w; st += w * t; sv += w * r.mgdl; stt += w * t * t; stv += w * t * r.mgdl;
  }
  const denominator = sw * stt - st * st;
  if (Math.abs(denominator) <= 1e-9) return null;
  let slope = (sw * stv - st * sv) / denominator;
  slope = Math.min(Math.max(slope, -maxSlope), maxSlope);
  const intercept = (sv - slope * st) / sw;
  let residual = 0;
  for (const r of recent) {
    const t = (r.date - last.date) / 60_000;
    residual += (r.mgdl - (intercept + slope * t)) ** 2;
  }
  return { slope, sigma: Math.sqrt(residual / Math.max(recent.length - 2, 1)) };
}

function recentOf(readings, now, options) {
  const last = readings[readings.length - 1];
  if (!last || (now - last.date) / 60_000 > options.maxAgeMinutes) return null;
  const recent = readings.filter((r) => (last.date - r.date) / 60_000 <= options.lookbackMinutes);
  if (recent.length < 3 || (last.date - recent[0].date) / 60_000 < 9) return null;
  return { last, recent };
}

/** La tendance actuelle (mg/dL par minute), ou nulle si la dernière mesure est trop vieille ou les mesures trop rares. */
export function trendSlope(readings, now, options = OPTIONS) {
  const found = recentOf(readings, now, options);
  return found ? regression(found.recent, found.last, options.maxSlope)?.slope ?? null : null;
}

/**
 * @returns {{ start: number, startValue: number, points: {minutes: number, date: number, value: number, low: number, high: number}[] } | null}
 */
export function predict(readings, now, options = OPTIONS) {
  const found = recentOf(readings, now, options);
  if (!found) return null;
  const { last, recent } = found;
  const fit = regression(recent, last, options.maxSlope);
  if (!fit) return null;
  const points = [];
  for (let i = 1; i <= options.horizonMinutes / options.stepMinutes; i++) {
    const minutes = i * options.stepMinutes;
    const value = Math.min(Math.max(last.mgdl + fit.slope * minutes, 39), 401);
    const spread = fit.sigma + 0.25 * minutes;
    points.push({
      minutes, date: last.date + minutes * 60_000, value,
      low: Math.max(value - spread, 39), high: Math.min(value + spread, 401),
    });
  }
  return { start: last.date, startValue: last.mgdl, points };
}
