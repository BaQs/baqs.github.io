// « Sur la période » : les constats de MelliCore/Advice.swift qui ne demandent que les glycémies (temps dans la cible,
// hypos fréquentes), mêmes seuils et mêmes mots. Les conseils de réglage (ratios, facteur de correction, cible de
// nuit) ont besoin du journal de la pompe (Glooko) : ils restent sur l'iPhone. Les nuits ne sont qu'observées.
import { percentile } from "./stats.js";

/**
 * @returns {{title: string, detail: string, tone: "info"}[]} vide sous 100 mesures sur la période
 */
export function periodFindings(readings, { low, high }, days, now = Date.now()) {
  const from = now - days * 86_400_000;
  const window = readings.filter((r) => r.date >= from && r.date <= now);
  if (window.length < 100) return [];
  // Les jours vraiment mesurés : Nightscout n'en garde parfois que quelques-uns.
  const covered = Math.max(1, Math.min(days, Math.round((now - window[0].date) / 86_400_000)));
  const total = window.length;
  const tir = (window.filter((r) => r.mgdl >= low && r.mgdl <= high).length / total) * 100;
  const lows = (window.filter((r) => r.mgdl < low).length / total) * 100;
  const items = [{
    tone: "info",
    title: `Temps dans la cible sur ${covered} jour${covered > 1 ? "s" : ""} : ${Math.round(tir)} %`,
    detail: tir >= 70 ? "Au-dessus de l'objectif de 70 %. Bonne période." : "L'objectif habituel est 70 %.",
  }];
  if (lows > 4) {
    items.push({
      tone: "info",
      title: `Hypos fréquentes : ${lows.toFixed(1)} % du temps sous ${Math.round(low)}`,
      detail: "L'objectif habituel est moins de 4 %. Un repas sur-dosé fait souvent l'hypo d'après : les conseils de ratio sont sur l'iPhone.",
    });
  }
  // Nuits : la médiane de 0 h à 3 h, observée seulement (la cible de nuit de la pompe se juge avec son journal).
  const nightValues = window.filter((r) => new Date(r.date).getHours() <= 2).map((r) => r.mgdl).sort((a, b) => a - b);
  if (nightValues.length >= 36) {
    items.push({
      tone: "info",
      title: `Nuits : médiane ${Math.round(percentile(nightValues, 0.5))} de 0 h à 3 h`,
      detail: "Une observation, pas un conseil de réglage : la cible de nuit de la pompe se juge sur l'iPhone, avec le journal de la pompe.",
    });
  }
  return items;
}
