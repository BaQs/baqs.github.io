// La mise en route : coller le lien de configuration de l'iPhone et son code, ou entrer l'adresse Nightscout à la main.
import { ConfigError, decodeConfig, extractConfigText, webSettings } from "../core/config.js";
import { Nightscout, normalizeURL } from "../sources/nightscout.js";
import { h, render } from "./h.js";

export function mountSetup(container, app, { prefill = "" } = {}) {
  const message = h("p", { class: "erreur", role: "alert" });
  const linkInput = h("textarea", { rows: "3", placeholder: "https://baqs.github.io/melli/c#MELLI1:…", autocomplete: "off", spellcheck: "false" });
  linkInput.value = prefill;
  const codeInput = h("input", { inputmode: "numeric", maxlength: "6", placeholder: "123456", autocomplete: "one-time-code" });
  const keep = h("input", { type: "checkbox", checked: true, id: "garder" });
  const busy = (button, on) => { button.disabled = on; button.textContent = on ? "Un instant…" : button.dataset.label; };

  const importButton = h("button", { class: "bouton plein", "data-label": "Importer", type: "submit" }, "Importer");
  const importForm = h("form", {
    class: "carte formulaire",
    onsubmit: async (event) => {
      event.preventDefault();
      message.textContent = "";
      const text = extractConfigText(linkInput.value);
      if (!text) { message.textContent = "Ce n'est pas un lien de configuration Melli : il contient « MELLI1: » après le dièse."; return; }
      busy(importButton, true);
      try {
        const config = webSettings(await decodeConfig(text, codeInput.value.trim()));
        if (!config.nightscoutURL) throw new Error("Cette configuration n'a pas de Nightscout : la version web ne lit que Nightscout.");
        await check(config);
        app.saveConfig({ ...config, persistent: keep.checked });
      } catch (e) {
        message.textContent = e instanceof ConfigError || e?.message ? e.message : "Import impossible.";
      } finally {
        busy(importButton, false);
      }
    },
  },
  h("h2", {}, "Avec le lien de l'iPhone"),
  h("p", { class: "sous" }, "Sur l'iPhone : Réglages › Configurer un autre iPhone › Envoyer un lien. Colle le lien ici, puis le code à 6 chiffres. Le déchiffrement se fait dans ce navigateur : rien n'est envoyé ailleurs."),
  h("label", {}, "Lien", linkInput),
  h("label", {}, "Code à 6 chiffres", codeInput),
  importButton);

  const urlInput = h("input", { type: "url", placeholder: "https://mon-nightscout.fr", autocomplete: "off" });
  const secretInput = h("input", { type: "password", placeholder: "jeton en lecture (recommandé) ou API secret", autocomplete: "off" });
  const nameInput = h("input", { placeholder: "Prénom de l'enfant" });
  const unitSelect = h("select", {}, h("option", { value: "mgdL" }, "mg/dL"), h("option", { value: "mmolL" }, "mmol/L"));
  const manualButton = h("button", { class: "bouton", "data-label": "Se connecter", type: "submit" }, "Se connecter");
  const manualForm = h("form", {
    class: "carte formulaire",
    onsubmit: async (event) => {
      event.preventDefault();
      message.textContent = "";
      const url = normalizeURL(urlInput.value);
      if (!url) { message.textContent = "Adresse Nightscout invalide."; return; }
      busy(manualButton, true);
      try {
        const config = {
          patientName: nameInput.value.trim(), unit: unitSelect.value, targetLow: 70, targetHigh: 180,
          night: { start: 21 * 60 + 30, end: 7 * 60 }, nightscoutURL: url, nightscoutSecret: secretInput.value.trim(),
        };
        await check(config);
        app.saveConfig({ ...config, persistent: keep.checked });
      } catch (e) {
        message.textContent = e?.message ?? "Connexion impossible.";
      } finally {
        busy(manualButton, false);
      }
    },
  },
  h("h2", {}, "Ou à la main"),
  h("label", {}, "Nightscout", urlInput),
  h("label", {}, "Jeton ou API secret", secretInput),
  h("label", {}, "Prénom", nameInput),
  h("label", {}, "Unité", unitSelect),
  manualButton);

  render(container,
    h("div", { class: "accueil-config" },
      h("h1", {}, "Melli"),
      h("p", {}, "La glycémie de votre enfant sur un ordinateur ou une tablette, lue sur votre Nightscout. Pour la famille, en lecture seule."),
      h("p", { class: "avertissement" }, "Pas d'alarme ici : un navigateur ne réveille personne de façon sûre. Les alarmes restent sur l'iPhone."),
      message,
      importForm,
      manualForm,
      h("label", { class: "case-a-cocher" }, keep, " Garder la connexion sur cet appareil (sinon, tout s'efface en fermant l'onglet)")));

  if (prefill) codeInput.focus();
  return { update: () => {}, unmount: () => {} };
}

/** Une première lecture, pour dire tout de suite si l'adresse ou l'accès ne vont pas. */
async function check(config) {
  const ns = new Nightscout(config.nightscoutURL, config.nightscoutSecret);
  await ns.entries({ count: 1 });
}
