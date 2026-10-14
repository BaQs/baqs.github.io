// Le lien de configuration d'un autre iPhone (« MELLI1:… » + code à 6 chiffres), déchiffré dans le navigateur :
// portage de ConfigTransfer.decode (iPhone). Texte = base64(sel de 16 octets + AES-GCM combiné : nonce 12 octets,
// chiffré, étiquette 16 octets) ; clé HKDF-SHA256(code, sel, « melli-configuration », 32 octets) ; contenu compressé
// en DEFLATE brut (NSData .zlib) ; dates en secondes depuis le 1er janvier 2001. Rien ne quitte le navigateur.

export const PREFIX = "MELLI1:";
/** Un lien envoyé par message vaut 24 h (un QR code, 10 min). */
export const LINK_LIFETIME = 24 * 3600_000;
const APPLE_EPOCH = 978_307_200_000;

export class ConfigError extends Error {
  /** @param {"notMelli"|"wrongCode"|"expired"} reason */
  constructor(reason) {
    super({
      notMelli: "Ce lien ne vient pas de Melli.",
      wrongCode: "Code incorrect.",
      expired: "Ce lien a expiré : demande-en un nouveau sur l'iPhone (Réglages › Configurer un autre iPhone).",
    }[reason]);
    this.reason = reason;
  }
}

/** Le texte « MELLI1:… » d'un lien collé (https://baqs.github.io/melli/c#…, melli://config#…) ou du texte lui-même. */
export function extractConfigText(input) {
  const raw = (input ?? "").trim();
  const hash = raw.includes("#") ? raw.slice(raw.indexOf("#") + 1) : raw;
  let text = hash;
  try { text = decodeURIComponent(hash); } catch { /* déjà décodé */ }
  return text.startsWith(PREFIX) ? text : null;
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * @returns {Promise<{settings: object, secrets: Record<string, string>, createdAt: number}>} createdAt en millisecondes
 */
export async function decodeConfig(text, code, { now = Date.now(), maxAge = LINK_LIFETIME } = {}) {
  if (!text?.startsWith(PREFIX)) throw new ConfigError("notMelli");
  let blob;
  try { blob = base64ToBytes(text.slice(PREFIX.length)); } catch { throw new ConfigError("notMelli"); }
  if (blob.length <= 16 + 12 + 16) throw new ConfigError("notMelli");
  const salt = blob.slice(0, 16), nonce = blob.slice(16, 28), sealed = blob.slice(28);
  const subtle = globalThis.crypto.subtle;
  const material = await subtle.importKey("raw", new TextEncoder().encode(code ?? ""), "HKDF", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("melli-configuration") },
    material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  let compressed;
  try {
    compressed = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, sealed));
  } catch {
    throw new ConfigError("wrongCode");
  }
  const payload = JSON.parse(new TextDecoder().decode(await inflateRaw(compressed)));
  const createdAt = APPLE_EPOCH + payload.createdAt * 1000;
  if (now - createdAt >= maxAge) throw new ConfigError("expired");
  return { settings: payload.settings ?? {}, secrets: payload.secrets ?? {}, createdAt };
}

/**
 * Ce que la version web garde d'une configuration : le prénom, l'unité, la cible, les heures de nuit et l'accès
 * Nightscout. Rien de Dexcom, LibreLinkUp ni Glooko (la version web ne lit que Nightscout).
 */
export function webSettings({ settings, secrets }) {
  const night = settings.alarms?.night;
  return {
    patientName: settings.patientName ?? "",
    unit: settings.unit === "mmolL" ? "mmolL" : "mgdL",
    targetLow: Number(settings.targetLow) || 70,
    targetHigh: Number(settings.targetHigh) || 180,
    night: night && Number.isFinite(night.start) && Number.isFinite(night.end) ? { start: night.start, end: night.end } : { start: 21 * 60 + 30, end: 7 * 60 },
    nightscoutURL: settings.nightscoutURL ?? "",
    nightscoutSecret: secrets["nightscout.secret"] ?? "",
  };
}
