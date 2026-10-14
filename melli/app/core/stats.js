// Statistiques du temps dans la cible, profil type (AGP) et carte heure par heure : portage de MelliCore/Stats.swift.
// Les jours et les heures sont ceux de l'heure locale du navigateur.
import { glucoseRange } from "./glucose.js";

const DAY = 86_400_000;

/** Minuit (heure locale) du jour de `ms`. */
export function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Minuit du jour `offset` jours après celui de `ms` (calendaire : juste aux changements d'heure). */
export function addDays(ms, offset) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
}

/**
 * Consensus international (Battelino 2019) : moyenne, écart type, parts par plage (en %), couverture.
 * @returns {null | {count: number, mean: number, sd: number, cv: number, gmi: number, veryLow: number, low: number,
 *   inRange: number, high: number, veryHigh: number, coverage: number}}
 */
export function glucoseStats(readings, from, to) {
  const values = readings.filter((r) => r.date >= from && r.date <= to).map((r) => r.mgdl);
  if (values.length === 0) return null;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(n - 1, 1));
  const counts = { veryLow: 0, low: 0, inRange: 0, high: 0, veryHigh: 0 };
  for (const v of values) counts[glucoseRange(v)]++;
  const share = (k) => (counts[k] / n) * 100;
  const expected = (to - from) / 300_000;
  return {
    count: n, mean, sd, cv: mean > 0 ? (sd / mean) * 100 : 0, gmi: 3.31 + 0.02392 * mean,
    veryLow: share("veryLow"), low: share("low"), inRange: share("inRange"), high: share("high"), veryHigh: share("veryHigh"),
    coverage: expected > 0 ? Math.min((n / expected) * 100, 100) : 0,
  };
}

/** Centile par interpolation linéaire sur des valeurs triées. */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const position = p * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, sorted.length - 1);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Profil type : centiles par tranche de 15 min, chaque tranche réunissant les mesures à ± 30 min, d'un jour à l'autre. */
export function agpBuckets(readings, bucketMinutes = 15, smoothingMinutes = 30) {
  const byMinute = readings.map((r) => {
    const d = new Date(r.date);
    return { minute: d.getHours() * 60 + d.getMinutes(), value: r.mgdl };
  });
  if (byMinute.length === 0) return [];
  const result = [];
  for (let start = 0; start < 1440; start += bucketMinutes) {
    const center = start + Math.floor(bucketMinutes / 2);
    const values = byMinute
      .filter((item) => { const distance = Math.abs(item.minute - center); return Math.min(distance, 1440 - distance) <= smoothingMinutes; })
      .map((item) => item.value)
      .sort((a, b) => a - b);
    if (values.length < 5) continue;
    result.push({
      minute: start, p5: percentile(values, 0.05), p25: percentile(values, 0.25), p50: percentile(values, 0.5),
      p75: percentile(values, 0.75), p95: percentile(values, 0.95),
    });
  }
  return result;
}

const SEVERITY = { none: 0, inRange: 1, high: 2, low: 3, veryHigh: 4 };

/** Couleur de dex : sous la cible, dedans, au-dessus, au-delà de 250. */
export function heatLevel(median, low, high, veryHigh = 250) {
  if (median === null || median === undefined) return "none";
  if (median < low) return "low";
  if (median <= high) return "inRange";
  if (median <= veryHigh) return "high";
  return "veryHigh";
}

function strongest(counts) {
  let best = "none", bestCount = -1;
  for (const [level, count] of Object.entries(counts)) {
    if (count > bestCount || (count === bestCount && SEVERITY[level] > SEVERITY[best])) { best = level; bestCount = count; }
  }
  return best;
}

/** Carte heure par heure : les `days` derniers jours calendaires (aujourd'hui compris), du plus ancien au plus récent. */
export function hourlyHeatmap(readings, days, now) {
  const first = addDays(startOfDay(now), -(days - 1));
  const buckets = new Map();
  for (const r of readings) {
    if (r.date < first || r.date > now) continue;
    const day = startOfDay(r.date);
    if (!buckets.has(day)) buckets.set(day, Array.from({ length: 24 }, () => []));
    buckets.get(day)[new Date(r.date).getHours()].push(r.mgdl);
  }
  const rows = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(first, i);
    const hours = buckets.get(day) ?? Array.from({ length: 24 }, () => []);
    rows.push({ date: day, medians: hours.map((v) => (v.length ? percentile([...v].sort((a, b) => a - b), 0.5) : null)) });
  }
  return {
    days: rows,
    /** Pour chaque heure, la couleur la plus fréquente (égalité : la pire) ; les heures sans mesure ne comptent pas. */
    dominantByHour(low, high, veryHigh = 250) {
      return Array.from({ length: 24 }, (_, hour) => {
        const counts = {};
        for (const d of rows) {
          const level = heatLevel(d.medians[hour], low, high, veryHigh);
          if (level !== "none") counts[level] = (counts[level] ?? 0) + 1;
        }
        return strongest(counts);
      });
    },
    /** Part de chaque couleur sur toutes les heures mesurées (0 à 1). */
    shares(low, high, veryHigh = 250) {
      const counts = {};
      for (const d of rows) for (const m of d.medians) {
        const level = heatLevel(m, low, high, veryHigh);
        if (level !== "none") counts[level] = (counts[level] ?? 0) + 1;
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total === 0) return {};
      return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / total]));
    },
    dominant(low, high, veryHigh = 250) {
      const shares = this.shares(low, high, veryHigh);
      return Object.keys(shares).length ? strongest(shares) : "none";
    },
  };
}

export { DAY };
