import { describe, expect, it } from "vitest";

import { validateConfig } from "../src/config";
import { resolveRooms } from "../src/rooms";
import type { HomeAssistant } from "../src/types";
import { climateState } from "./helpers";

const TYPE = "custom:room-climate-card";

function hassWithRegistry(): HomeAssistant {
  return {
    states: {
      "climate.living_ac": climateState({ entity_id: "climate.living_ac" }),
      "climate.living_trv": climateState({ entity_id: "climate.living_trv" }),
    },
    entities: {
      "climate.living_ac": {
        entity_id: "climate.living_ac",
        device_id: "dev1",
        platform: "daikin",
      },
      "climate.living_trv": {
        entity_id: "climate.living_trv",
        area_id: "living_room",
        platform: "generic_thermostat",
      },
      "sensor.living_humidity": {
        entity_id: "sensor.living_humidity",
        area_id: "living_room",
        platform: "mqtt",
      },
    },
    devices: { dev1: { id: "dev1", area_id: "living_room" } },
    areas: { living_room: { area_id: "living_room", name: "Living Room" } },
    connected: true,
    language: "en",
    config: { unit_system: { temperature: "°C" } },
    callService: () => Promise.resolve(undefined),
  };
}

describe("resolveRooms", () => {
  it("resolves an area room via entity area and device-area fallback, preferring daikin as primary", () => {
    const hass = hassWithRegistry();
    const [room] = resolveRooms(hass, validateConfig({ type: TYPE, rooms: ["living_room"] }));
    expect(room.name).toBe("Living Room");
    expect(room.climateIds.sort()).toEqual(["climate.living_ac", "climate.living_trv"]);
    expect(room.primaryId).toBe("climate.living_ac"); // daikin platform preferred
    expect(room.error).toBeUndefined();
  });

  it("honors an explicit primary override", () => {
    const hass = hassWithRegistry();
    const [room] = resolveRooms(
      hass,
      validateConfig({
        type: TYPE,
        rooms: [{ area: "living_room", primary: "climate.living_trv" }],
      }),
    );
    expect(room.primaryId).toBe("climate.living_trv");
  });

  it("reports a diagnostic error for a nonexistent area", () => {
    const hass = hassWithRegistry();
    const [room] = resolveRooms(hass, validateConfig({ type: TYPE, rooms: ["garage"] }));
    expect(room.error?.key).toBe("card.area_missing");
    expect(room.error?.vars.area).toBe("garage");
  });

  it("reports a diagnostic error for an area with no climate entities", () => {
    const hass = hassWithRegistry();
    hass.areas.empty_room = { area_id: "empty_room", name: "Empty Room" };
    const [room] = resolveRooms(hass, validateConfig({ type: TYPE, rooms: ["empty_room"] }));
    expect(room.error?.key).toBe("card.room_empty");
    expect(room.error?.vars.room).toBe("Empty Room");
  });

  it("resolves an explicit-entities room without registry data", () => {
    const hass = hassWithRegistry();
    const [room] = resolveRooms(
      hass,
      validateConfig({ type: TYPE, rooms: [{ entities: ["climate.living_ac"], name: "Lounge" }] }),
    );
    expect(room.name).toBe("Lounge");
    expect(room.primaryId).toBe("climate.living_ac");
  });
});
