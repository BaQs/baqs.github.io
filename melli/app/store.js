// Ce que la version web garde dans le navigateur : la configuration (et l'accès Nightscout) et les mesures des
// 30 derniers jours. « Garder sur cet appareil » décoché : tout reste dans l'onglet (sessionStorage) et disparaît
// à sa fermeture. Rien n'est envoyé ailleurs qu'au Nightscout de la famille.

const KEY = "melli.web.v1";
const READINGS = "melli.web.readings.v1";
const KEEP_DAYS = 30;

function storages() {
  const list = [];
  try { list.push(window.localStorage); } catch { /* navigation privée, stockage bloqué */ }
  try { list.push(window.sessionStorage); } catch { /* idem */ }
  return list;
}

function read(key) {
  for (const s of storages()) {
    try { const v = s.getItem(key); if (v) return JSON.parse(v); } catch { /* illisible : ignoré */ }
  }
  return null;
}

function target(persistent) {
  try { return persistent ? window.localStorage : window.sessionStorage; } catch { return null; }
}

export function loadConfig() {
  return read(KEY);
}

/** @param {object} config réglages de webSettings, plus `persistent` */
export function saveConfig(config) {
  forget();
  try { target(config.persistent)?.setItem(KEY, JSON.stringify(config)); } catch { /* plein ou bloqué */ }
}

/** Les mesures en tableaux compacts [date, mg/dL, tendance] pour tenir dans le stockage du navigateur. */
export function loadReadings() {
  const raw = read(READINGS);
  if (!Array.isArray(raw)) return [];
  return raw.map(([date, mgdl, trend]) => ({ date, mgdl, trend: trend || "unknown" }));
}

export function saveReadings(readings, persistent) {
  const since = Date.now() - KEEP_DAYS * 86_400_000;
  const compact = readings.filter((r) => r.date >= since).map((r) => [r.date, r.mgdl, r.trend === "unknown" ? "" : r.trend]);
  try { target(persistent)?.setItem(READINGS, JSON.stringify(compact)); } catch { /* plein : on garde en mémoire */ }
}

/** Efface tout ce que Melli a gardé dans ce navigateur. */
export function forget() {
  for (const s of storages()) {
    try { s.removeItem(KEY); s.removeItem(READINGS); } catch { /* rien à faire */ }
  }
}
