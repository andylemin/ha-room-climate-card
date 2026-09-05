/* Minimal Home Assistant frontend surface used by this card. Kept local
 * (rather than depending on the stale custom-card-helpers types) so the
 * contract we rely on is explicit and testable. */

export interface HassEntityAttributes {
  friendly_name?: string;
  current_temperature?: number | null;
  temperature?: number | null;
  target_temp_high?: number | null;
  target_temp_low?: number | null;
  min_temp?: number;
  max_temp?: number;
  target_temp_step?: number;
  hvac_modes?: string[];
  hvac_action?: string;
  fan_modes?: string[];
  fan_mode?: string;
  swing_modes?: string[];
  swing_mode?: string;
  preset_modes?: string[];
  preset_mode?: string;
  supported_features?: number;
  unit_of_measurement?: string;
  device_class?: string;
  [key: string]: unknown;
}

export interface HassEntityState {
  entity_id: string;
  state: string;
  attributes: HassEntityAttributes;
  last_changed: string;
  last_updated: string;
}

export interface EntityRegistryEntry {
  entity_id: string;
  device_id?: string | null;
  area_id?: string | null;
  platform?: string;
  hidden?: boolean;
  disabled_by?: string | null;
}

export interface DeviceRegistryEntry {
  id: string;
  area_id?: string | null;
  name?: string | null;
}

export interface AreaRegistryEntry {
  area_id: string;
  name: string;
  icon?: string | null;
}

export interface HomeAssistant {
  states: Record<string, HassEntityState>;
  entities: Record<string, EntityRegistryEntry>;
  devices: Record<string, DeviceRegistryEntry>;
  areas: Record<string, AreaRegistryEntry>;
  connected: boolean;
  language: string;
  locale?: { language: string; number_format?: string; temperature_unit?: string };
  themes?: { darkMode?: boolean };
  config: { unit_system: { temperature: string } };
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ): Promise<unknown>;
  formatEntityState?(stateObj: HassEntityState): string;
  formatEntityAttributeValue?(stateObj: HassEntityState, attribute: string): string;
}

/* ClimateEntityFeature bits (HA core homeassistant/components/climate/const.py). */
export const enum ClimateFeature {
  TARGET_TEMPERATURE = 1,
  TARGET_TEMPERATURE_RANGE = 2,
  TARGET_HUMIDITY = 4,
  FAN_MODE = 8,
  PRESET_MODE = 16,
  SWING_MODE = 32,
  TURN_OFF = 128,
  TURN_ON = 256,
}
