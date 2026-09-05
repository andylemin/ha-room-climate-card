import { describe, expect, it } from "vitest";

import { shouldUpdateForHass } from "../src/has-changed";
import type { HomeAssistant } from "../src/types";
import { climateState } from "./helpers";

function hassWith(overrides: Partial<HomeAssistant> = {}): HomeAssistant {
  return {
    states: { "climate.test": climateState() },
    entities: {},
    devices: {},
    areas: {},
    connected: true,
    language: "en",
    locale: { language: "en" },
    themes: { darkMode: false },
    config: { unit_system: { temperature: "°C" } },
    callService: () => Promise.resolve(undefined),
    ...overrides,
  };
}

describe("shouldUpdateForHass", () => {
  it("updates on first hass", () => {
    expect(shouldUpdateForHass(undefined, hassWith(), ["climate.test"])).toBe(true);
  });

  it("skips when an unrelated entity changed", () => {
    const oldHass = hassWith();
    const newHass = hassWith({
      // same watched state object identity; new hass object with extra entity
      states: { ...oldHass.states, "light.other": climateState({ entity_id: "light.other" }) },
      locale: oldHass.locale,
      themes: oldHass.themes,
      formatEntityState: oldHass.formatEntityState,
    });
    expect(shouldUpdateForHass(oldHass, newHass, ["climate.test"])).toBe(false);
  });

  it("updates when a watched entity's state object identity changed", () => {
    const oldHass = hassWith();
    const newHass = hassWith({
      states: { "climate.test": climateState({ attributes: { temperature: 25 } }) },
      locale: oldHass.locale,
      themes: oldHass.themes,
    });
    expect(shouldUpdateForHass(oldHass, newHass, ["climate.test"])).toBe(true);
  });

  it("updates on connection, locale, and theme identity changes", () => {
    const oldHass = hassWith();
    expect(
      shouldUpdateForHass(
        oldHass,
        hassWith({ states: oldHass.states, connected: false, locale: oldHass.locale, themes: oldHass.themes }),
        ["climate.test"],
      ),
    ).toBe(true);
    expect(
      shouldUpdateForHass(
        oldHass,
        hassWith({ states: oldHass.states, themes: oldHass.themes, locale: { language: "de" } }),
        ["climate.test"],
      ),
    ).toBe(true);
    expect(
      shouldUpdateForHass(
        oldHass,
        hassWith({ states: oldHass.states, locale: oldHass.locale, themes: { darkMode: true } }),
        ["climate.test"],
      ),
    ).toBe(true);
  });
});
