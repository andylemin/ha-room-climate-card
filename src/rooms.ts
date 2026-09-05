import type { RoomClimateCardConfig, RoomEntryConfig } from "./config";
import type { HomeAssistant } from "./types";

export interface RoomModel {
  key: string;
  name: string;
  icon?: string;
  primaryId?: string;
  climateIds: string[];
  error?: { key: string; vars: Record<string, string> };
}

/* Resolve a room's entity ID via its own area, falling back to its device's
 * area (Dwains algorithm — plan §Phase 2). */
function entityArea(hass: HomeAssistant, entityId: string): string | null {
  const entry = hass.entities?.[entityId];
  if (!entry) return null;
  if (entry.area_id) return entry.area_id;
  if (entry.device_id) return hass.devices?.[entry.device_id]?.area_id ?? null;
  return null;
}

function climateIdsInArea(hass: HomeAssistant, areaId: string): string[] {
  const ids: string[] = [];
  for (const entityId of Object.keys(hass.entities ?? {})) {
    if (!entityId.startsWith("climate.")) continue;
    const entry = hass.entities[entityId];
    if (entry.hidden || entry.disabled_by) continue;
    if (entityArea(hass, entityId) === areaId) ids.push(entityId);
  }
  return ids;
}

function pickPrimary(hass: HomeAssistant, climateIds: string[], configured?: string): string | undefined {
  if (configured && climateIds.includes(configured)) return configured;
  // Prefer the Daikin unit when several climate entities share the room.
  const daikin = climateIds.find((id) => hass.entities?.[id]?.platform === "daikin");
  return daikin ?? climateIds[0];
}

export function resolveRoom(hass: HomeAssistant, entry: RoomEntryConfig): RoomModel {
  const areaId = typeof entry === "string" ? entry : entry.area;
  const explicit = typeof entry === "string" ? undefined : entry.entities;
  const configuredPrimary = typeof entry === "string" ? undefined : entry.primary;
  const configuredName = typeof entry === "string" ? undefined : entry.name;
  const icon = typeof entry === "string" ? undefined : entry.icon;

  if (areaId) {
    const area = hass.areas?.[areaId];
    if (!area) {
      return {
        key: areaId,
        name: configuredName ?? areaId,
        icon,
        climateIds: [],
        error: { key: "card.area_missing", vars: { area: areaId } },
      };
    }
    const climateIds = explicit?.filter((id) => id.startsWith("climate.")) ??
      climateIdsInArea(hass, areaId);
    const model: RoomModel = {
      key: areaId,
      name: configuredName ?? area.name,
      icon: icon ?? area.icon ?? undefined,
      climateIds,
      primaryId: pickPrimary(hass, climateIds, configuredPrimary),
    };
    if (climateIds.length === 0) {
      model.error = { key: "card.room_empty", vars: { room: model.name } };
    }
    return model;
  }

  const climateIds = (explicit ?? []).filter((id) => id.startsWith("climate."));
  const primaryId = pickPrimary(hass, climateIds, configuredPrimary);
  const name =
    configuredName ??
    (primaryId ? (hass.states[primaryId]?.attributes.friendly_name ?? primaryId) : "Room");
  const model: RoomModel = {
    key: climateIds[0] ?? "room",
    name,
    icon,
    climateIds,
    primaryId,
  };
  if (climateIds.length === 0) {
    model.error = { key: "card.room_empty", vars: { room: name } };
  }
  return model;
}

export function resolveRooms(hass: HomeAssistant, config: RoomClimateCardConfig): RoomModel[] {
  return config.rooms.map((entry) => resolveRoom(hass, entry));
}
