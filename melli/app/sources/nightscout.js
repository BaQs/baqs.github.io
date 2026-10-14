// Client Nightscout en lecture seule (API v1), portage de NightscoutClient.swift : jeton d'accès (`?token=`) ou
// API secret haché en SHA-1 (en-tête `api-secret`). La version web n'écrit jamais.
import { trendFromDirection } from "../core/glucose.js";

export class NightscoutError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

/** « melli-0123456789abcdef » : un jeton ; tout le reste est un API secret. */
export function looksLikeToken(secret) {
  return /^[a-z0-9_]+-[0-9a-f]{16}$/.test(secret ?? "");
}

export function normalizeURL(text) {
  let url = (text ?? "").trim();
  if (!url) return null;
  if (!url.toLowerCase().startsWith("http")) url = (/^(localhost|127\.0\.0\.1)(:|\/|$)/.test(url) ? "http://" : "https://") + url;
  url = url.replace(/\/+$/, "");
  try { return new URL(url).host ? url : null; } catch { return null; }
}

async function sha1Hex(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function readingFromEntry(entry) {
  if (typeof entry?.sgv !== "number" || typeof entry?.date !== "number") return null;
  return { date: entry.date, mgdl: entry.sgv, trend: trendFromDirection(entry.direction), device: entry.device };
}

export class Nightscout {
  /** @param {string} baseURL @param {string} secret jeton, ou API secret */
  constructor(baseURL, secret, fetchImpl = globalThis.fetch.bind(globalThis)) {
    const url = normalizeURL(baseURL);
    if (!url) throw new NightscoutError("Adresse Nightscout invalide.", "badURL");
    this.baseURL = url;
    this.secret = (secret ?? "").trim();
    this.fetch = fetchImpl;
  }

  async get(path, query = {}) {
    const url = new URL(`${this.baseURL}/${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    const headers = { Accept: "application/json" };
    if (this.secret && looksLikeToken(this.secret)) url.searchParams.set("token", this.secret);
    else if (this.secret) headers["api-secret"] = await sha1Hex(this.secret);
    let response;
    try {
      response = await this.fetch(url, { headers, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    } catch {
      throw new NightscoutError("Nightscout injoignable (réseau, adresse, ou site qui refuse les navigateurs).", "network");
    }
    if (response.status === 401 || response.status === 403) throw new NightscoutError("Accès refusé : vérifie le jeton ou l'API secret.", "unauthorized");
    if (!response.ok) throw new NightscoutError(`Nightscout a répondu ${response.status}.`, "http");
    try { return await response.json(); } catch { throw new NightscoutError("Réponse illisible.", "decoding"); }
  }

  /** Glycémies après `since` (millisecondes), de la plus ancienne à la plus récente. */
  async entries({ since = null, count = 300 } = {}) {
    const query = { count };
    if (since !== null) query["find[date][$gt]"] = Math.floor(since);
    const array = await this.get("api/v1/entries/sgv.json", query);
    if (!Array.isArray(array)) throw new NightscoutError("Réponse illisible.", "decoding");
    return array.map(readingFromEntry).filter(Boolean).sort((a, b) => a.date - b.date);
  }

  /** La version du site et son unité, pour vérifier l'accès à la connexion. */
  async status() {
    const s = await this.get("api/v1/status.json");
    return { version: s?.version ?? "?", units: s?.settings?.units ?? "mg/dl" };
  }
}
