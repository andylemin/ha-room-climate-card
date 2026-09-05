import en from "./translations/en.json";

import type { HomeAssistant } from "./types";

type Translation = Record<string, unknown>;

/* Locale files register here; en is the base and the fallback.
 * Additional languages land as src/translations/<lang>.json (v1.0). */
const LANGUAGES: Record<string, Translation> = { en };

function lookup(lang: string, key: string): string | undefined {
  const parts = key.split(".");
  let node: unknown = LANGUAGES[lang];
  for (const part of parts) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Translation)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function localize(
  hass: HomeAssistant | undefined,
  key: string,
  vars?: Record<string, string>,
): string {
  const lang = (hass?.locale?.language ?? hass?.language ?? "en").split("-")[0];
  let text = lookup(lang, key) ?? lookup("en", key) ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, value);
    }
  }
  return text;
}
