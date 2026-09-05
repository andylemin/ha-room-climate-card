import { describe, expect, it } from "vitest";

import { formatEntityTemperature, formatTemperature, temperatureUnit } from "../src/format";
import type { HomeAssistant } from "../src/types";
import { climateState } from "./helpers";

const hass = (over: Partial<HomeAssistant> = {}): HomeAssistant =>
  ({
    states: { "climate.test": climateState() },
    entities: {},
    devices: {},
    areas: {},
    connected: true,
    language: "en",
    locale: { language: "en" },
    config: { unit_system: { temperature: "°C" } },
    callService: () => Promise.resolve(undefined),
    ...over,
  }) as HomeAssistant;

describe("formatTemperature", () => {
  it("appends the instance's unit", () => {
    expect(formatTemperature(hass(), 21.5)).toBe("21.5 °C");
    expect(
      formatTemperature(hass({ config: { unit_system: { temperature: "°F" } } }), 70),
    ).toBe("70 °F");
  });

  it("uses the frontend locale's decimal separator", () => {
    expect(formatTemperature(hass({ locale: { language: "de" } }), 21.5)).toBe("21,5 °C");
  });

  it("renders a placeholder with the unit when there is no value", () => {
    expect(formatTemperature(hass(), null)).toBe("-- °C");
  });
});

describe("formatEntityTemperature", () => {
  it("prefers HA's own entity formatter", () => {
    const h = hass({ formatEntityAttributeValue: () => "27 °C (HA)" });
    expect(formatEntityTemperature(h, "climate.test", "current_temperature", 27)).toBe(
      "27 °C (HA)",
    );
  });

  it("falls back to manual formatting when HA has no formatter", () => {
    expect(formatEntityTemperature(hass(), "climate.test", "current_temperature", 27)).toBe(
      "27 °C",
    );
  });
});

describe("temperatureUnit", () => {
  it("defaults to Celsius", () => {
    expect(temperatureUnit(undefined)).toBe("°C");
  });
});
