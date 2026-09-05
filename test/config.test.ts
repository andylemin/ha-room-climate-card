import { describe, expect, it } from "vitest";

import { storageKey, validateConfig } from "../src/config";

const TYPE = "custom:room-climate-card";

describe("validateConfig", () => {
  it("accepts an area-string room", () => {
    const cfg = validateConfig({ type: TYPE, rooms: ["living_room"] });
    expect(cfg.rooms).toEqual(["living_room"]);
  });

  it("accepts an explicit-entities room with a climate entity", () => {
    const cfg = validateConfig({
      type: TYPE,
      rooms: [{ entities: ["climate.bedroom", "sensor.bedroom_humidity"] }],
    });
    expect(cfg.rooms).toHaveLength(1);
  });

  it("rejects a missing rooms list but accepts an empty one", () => {
    expect(() => validateConfig({ type: TYPE })).toThrow(/invalid configuration/);
    // The card picker's stub config; renders a diagnostic empty state.
    expect(validateConfig({ type: TYPE, rooms: [] }).rooms).toEqual([]);
  });

  it("rejects a room object with neither area nor entities", () => {
    expect(() => validateConfig({ type: TYPE, rooms: [{ name: "x" }] })).toThrow(
      /`area` or a non-empty `entities`/,
    );
  });

  it("rejects explicit entities without any climate entity", () => {
    expect(() =>
      validateConfig({ type: TYPE, rooms: [{ entities: ["sensor.humidity"] }] }),
    ).toThrow(/at least one climate\.\*/);
  });

  it("tolerates keys HA adds to card configs", () => {
    // HA and other tooling inject their own keys; an exact struct would reject
    // them and the card would render as "Configuration error".
    expect(() =>
      validateConfig({
        type: TYPE,
        rooms: [{ entities: ["climate.a"], name: "A", card_mod: { style: "" } }],
        view_layout: {},
        grid_options: { columns: 12 },
        visibility: [],
      }),
    ).not.toThrow();
  });

  it("rejects non-object config", () => {
    expect(() => validateConfig(null)).toThrow(/must be an object/);
  });
});

describe("storageKey", () => {
  it("uses the first room's area ID", () => {
    expect(storageKey(validateConfig({ type: TYPE, rooms: ["living_room", "bedroom"] }))).toBe(
      "rcc:living_room",
    );
    expect(
      storageKey(validateConfig({ type: TYPE, rooms: [{ area: "study", name: "Study" }] })),
    ).toBe("rcc:study");
  });

  it("falls back to the first climate entity for explicit rooms", () => {
    expect(
      storageKey(
        validateConfig({
          type: TYPE,
          rooms: [{ entities: ["climate.bedroom"] }],
        }),
      ),
    ).toBe("rcc:climate.bedroom");
  });
});
