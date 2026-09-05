import {
  array,
  assert,
  boolean,
  number,
  optional,
  refine,
  string,
  type as looseObject,
  union,
  type Infer,
} from "superstruct";

/* Card config (plan §2.2 / §Phase 1): rooms-based from day one.
 * A room entry is either an area ID string or an object naming an area or an
 * explicit entity set, with optional per-room overrides. */

/* `type()` rather than `object()`: HA and other cards' tooling add their own
 * keys to a card config (view_layout, grid_options, visibility, card_mod…).
 * An exact struct would reject them and the card would refuse to render. */
const roomObjectStruct = looseObject({
  area: optional(string()),
  entities: optional(array(string())),
  name: optional(string()),
  icon: optional(string()),
  primary: optional(string()),
  temp_entity: optional(string()),
  humidity_entity: optional(string()),
  power_entity: optional(string()),
  exclude: optional(array(string())),
});

const roomEntryStruct = union([string(), roomObjectStruct]);

const configStruct = looseObject({
  type: string(),
  // An empty list is "not configured yet" (the card picker's stub config) and
  // renders a diagnostic empty state rather than a configuration error.
  rooms: array(roomEntryStruct),
  default_room: optional(string()),
  density: optional(string()),
  reduce_motion: optional(boolean()),
  outdoor_sensors: optional(array(string())),
  idle_return_s: optional(number()),
});

export type RoomEntryConfig = Infer<typeof roomEntryStruct>;
export type RoomClimateCardConfig = Infer<typeof configStruct>;

export function validateConfig(config: unknown): RoomClimateCardConfig {
  if (!config || typeof config !== "object") {
    throw new Error("room-climate-card: configuration must be an object");
  }
  try {
    assert(config, configStruct);
  } catch (err) {
    throw new Error(`room-climate-card: invalid configuration — ${(err as Error).message}`);
  }
  const cfg = config as RoomClimateCardConfig;
  for (const entry of cfg.rooms) {
    if (typeof entry === "string") continue;
    const hasArea = Boolean(entry.area);
    const hasEntities = Array.isArray(entry.entities) && entry.entities.length > 0;
    if (!hasArea && !hasEntities) {
      throw new Error(
        "room-climate-card: a room entry needs `area` or a non-empty `entities` list",
      );
    }
    if (!hasArea && !entry.entities!.some((id) => id.startsWith("climate."))) {
      throw new Error(
        "room-climate-card: a room's `entities` must include at least one climate.* entity",
      );
    }
  }
  return cfg;
}

/* Stable per-card storage key (plan §2.2): the first room's area ID if it is
 * an area, else its first climate entity ID. */
export function storageKey(config: RoomClimateCardConfig): string {
  const first = config.rooms[0];
  if (typeof first === "string") return `rcc:${first}`;
  if (first.area) return `rcc:${first.area}`;
  const climate = first.entities?.find((id) => id.startsWith("climate."));
  return `rcc:${climate ?? first.entities?.[0] ?? "unconfigured"}`;
}
