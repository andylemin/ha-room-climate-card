import type { HomeAssistant } from "./types";

/* Locale- and unit-aware value formatting (plan Goal req 6). Entity-sourced
 * values go through HA's own formatters; the optimistic dial value is not in
 * the entity yet, so it is formatted with the frontend's locale and the
 * instance's temperature unit. */

export function temperatureUnit(hass: HomeAssistant | undefined): string {
  return hass?.config?.unit_system?.temperature ?? "°C";
}

export function formatTemperature(
  hass: HomeAssistant | undefined,
  value: number | null | undefined,
): string {
  if (value == null || Number.isNaN(value)) return `-- ${temperatureUnit(hass)}`;
  const language = hass?.locale?.language ?? hass?.language ?? "en";
  const step = String(value).split(".")[1]?.length ?? 0;
  let text: string;
  try {
    text = new Intl.NumberFormat(language, {
      minimumFractionDigits: 0,
      maximumFractionDigits: Math.min(step, 2),
    }).format(value);
  } catch {
    text = String(value);
  }
  return `${text} ${temperatureUnit(hass)}`;
}

/* Prefer HA's own entity formatter when the value comes from the entity. */
export function formatEntityTemperature(
  hass: HomeAssistant | undefined,
  entityId: string | undefined,
  attribute: "temperature" | "current_temperature",
  fallback: number | null | undefined,
): string {
  const stateObj = entityId ? hass?.states[entityId] : undefined;
  if (hass?.formatEntityAttributeValue && stateObj?.attributes[attribute] != null) {
    try {
      return hass.formatEntityAttributeValue(stateObj, attribute);
    } catch {
      /* fall through to manual formatting */
    }
  }
  return formatTemperature(hass, fallback);
}
