import type { HomeAssistant } from "./types";

/* Render gate (plan §1.3 / §Phase 1, better-thermostat's has-changed pattern):
 * HA replaces the whole `hass` object on every state change of ANY entity.
 * Re-render only when one of the card's own entities changed (HA state objects
 * are immutable — reference comparison suffices), or when locale/theme/
 * connection/formatter identity changed. */
export function shouldUpdateForHass(
  oldHass: HomeAssistant | undefined,
  newHass: HomeAssistant,
  watchedEntityIds: Iterable<string>,
): boolean {
  if (!oldHass) return true;
  if (oldHass.connected !== newHass.connected) return true;
  if (oldHass.locale !== newHass.locale) return true;
  if (oldHass.themes !== newHass.themes) return true;
  if (oldHass.language !== newHass.language) return true;
  if (oldHass.formatEntityState !== newHass.formatEntityState) return true;
  for (const id of watchedEntityIds) {
    if (oldHass.states[id] !== newHass.states[id]) return true;
  }
  return false;
}
