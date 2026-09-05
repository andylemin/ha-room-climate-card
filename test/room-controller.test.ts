import { describe, expect, it } from "vitest";

import { DEBOUNCE_MS, DRAG_WATCHDOG_MS, HOLDOFF_MS } from "../src/const";
import { RoomController } from "../src/room-controller";
import { climateState, FakeHost, flush } from "./helpers";

function make(overrides = {}) {
  const host = new FakeHost();
  const controller = new RoomController("climate.test", host);
  controller.updateFromState(climateState(overrides));
  return { host, controller };
}

describe("snap", () => {
  it("anchors to min_temp, not zero", () => {
    const { controller } = make({
      attributes: { min_temp: 10.2, max_temp: 32, target_temp_step: 0.5, temperature: 24 },
    });
    // 10.2 + k*0.5 grid: 24.0 is not on it; nearest grid point to 24.01 is 23.7 or 24.2
    expect(controller.snap(24.01)).toBeCloseTo(24.2, 5);
  });

  it("clamps into [min, max]", () => {
    const { controller } = make();
    expect(controller.snap(5)).toBe(10);
    expect(controller.snap(40)).toBe(32);
  });

  it("fixes float dust to the step's decimals", () => {
    const { controller } = make();
    expect(controller.snap(21.300000000000004)).toBe(21.5);
    expect(String(controller.snap(21.25))).not.toContain("0000");
  });
});

describe("capability gating", () => {
  it("reports target temperature only when the bit AND the attribute exist", () => {
    const { controller } = make();
    expect(controller.supportsTargetTemperature).toBe(true);
    const dry = make({ state: "dry", attributes: { temperature: null } });
    expect(dry.controller.supportsTargetTemperature).toBe(false);
  });

  it("treats unavailable/unknown as unavailable", () => {
    const { controller } = make({ state: "unavailable" });
    expect(controller.available).toBe(false);
    const none = new RoomController("climate.test", new FakeHost());
    expect(none.available).toBe(false);
  });
});

describe("interaction pipeline", () => {
  it("debounces the service call and holds the optimistic value", async () => {
    const { host, controller } = make();
    controller.beginDrag(25.0);
    expect(controller.displayTemperature).toBe(25);
    expect(host.calls).toHaveLength(0);

    controller.commit(25.0);
    expect(host.calls).toHaveLength(0); // debounce pending
    host.advance(DEBOUNCE_MS);
    await flush();
    expect(host.calls).toEqual([
      {
        domain: "climate",
        service: "set_temperature",
        data: { entity_id: "climate.test", temperature: 25 },
      },
    ]);
    expect(controller.phase).toBe("holdoff");
    // Entity echo of a stale value must NOT overwrite during holdoff.
    controller.updateFromState(climateState({ attributes: { temperature: 24 } }));
    expect(controller.displayTemperature).toBe(25);
  });

  it("re-commits during debounce collapse to one call with the last value", async () => {
    const { host, controller } = make();
    controller.commit(25);
    controller.commit(26);
    controller.commit(27);
    host.advance(DEBOUNCE_MS);
    await flush();
    expect(host.calls).toHaveLength(1);
    expect(host.calls[0].data.temperature).toBe(27);
  });

  it("releases early when the echo matches the pending value", async () => {
    const { host, controller } = make();
    controller.commit(25);
    host.advance(DEBOUNCE_MS);
    await flush();
    expect(controller.phase).toBe("holdoff");
    controller.updateFromState(climateState({ attributes: { temperature: 25 } }));
    expect(controller.phase).toBe("idle");
    expect(controller.displayTemperature).toBe(25); // now from entity
  });

  it("resyncs to entity truth when the holdoff expires without an echo", async () => {
    const { host, controller } = make();
    controller.commit(25);
    host.advance(DEBOUNCE_MS);
    await flush();
    host.advance(HOLDOFF_MS);
    expect(controller.phase).toBe("idle");
    expect(controller.displayTemperature).toBe(24); // entity value
  });

  it("surfaces an error state on service failure instead of a silent revert", async () => {
    const { host, controller } = make();
    host.failNext = true;
    controller.commit(25);
    host.advance(DEBOUNCE_MS);
    await flush();
    expect(controller.phase).toBe("error");
    expect(controller.errorKey).toBe("card.error_set_temperature");
    expect(controller.displayTemperature).toBe(24); // reverted to entity truth
  });

  it("snaps committed values to the step grid before sending", async () => {
    const { host, controller } = make();
    controller.commit(24.87);
    host.advance(DEBOUNCE_MS);
    await flush();
    expect(host.calls[0].data.temperature).toBe(25);
  });
});

describe("mode & power services", () => {
  it("sets hvac mode", async () => {
    const { host, controller } = make();
    await controller.setHvacMode("dry");
    expect(host.calls[0]).toMatchObject({
      service: "set_hvac_mode",
      data: { hvac_mode: "dry" },
    });
  });

  it("toggles power based on current mode", async () => {
    const on = make();
    await on.controller.togglePower();
    expect(on.host.calls[0].service).toBe("turn_off");
    const off = make({ state: "off" });
    await off.controller.togglePower();
    expect(off.host.calls[0].service).toBe("turn_on");
  });

  it("surfaces mode-change failures", async () => {
    const { host, controller } = make();
    host.failNext = true;
    await controller.setHvacMode("heat");
    expect(controller.phase).toBe("error");
    expect(controller.errorKey).toBe("card.error_set_mode");
  });
});

describe("interaction recovery", () => {
  it("snaps to a grid anchored at a fractional min_temp", () => {
    const { controller } = make({
      attributes: { min_temp: 10.5, max_temp: 32, target_temp_step: 1, temperature: 20.5 },
    });
    expect(controller.snap(20)).toBe(20.5);
    expect(controller.snap(21.4)).toBe(21.5);
  });

  it("abandons a drag that never commits, restoring entity truth", () => {
    const { host, controller } = make();
    controller.beginDrag(28);
    expect(controller.displayTemperature).toBe(28);
    host.advance(DRAG_WATCHDOG_MS);
    expect(controller.phase).toBe("idle");
    expect(controller.displayTemperature).toBe(24);
  });

  it("ignores drags and commits when the mode has no setpoint", () => {
    const { host, controller } = make({ state: "fan_only", attributes: { temperature: null } });
    controller.beginDrag(25);
    controller.commit(25);
    host.advance(DEBOUNCE_MS);
    expect(host.calls).toHaveLength(0);
    expect(controller.phase).toBe("idle");
  });

  it("keeps a newer queued commit when an in-flight call fails", async () => {
    const { host, controller } = make();
    host.failNext = true;
    controller.commit(25);
    host.advance(DEBOUNCE_MS); // fires the failing call
    controller.commit(26); // user moved on while it was in flight
    await flush();
    expect(controller.errorKey).toBe("card.error_set_temperature");
    expect(controller.phase).toBe("pending");
    expect(controller.displayTemperature).toBe(26);
    host.failNext = false;
    host.advance(DEBOUNCE_MS);
    await flush();
    expect(host.calls.at(-1)?.data.temperature).toBe(26);
  });
});

describe("teardown", () => {
  it("dispose clears all pending timers", () => {
    const { host, controller } = make();
    controller.beginDrag(25);
    expect(host.pendingTimerCount).toBeGreaterThan(0);
    controller.dispose();
    expect(host.pendingTimerCount).toBe(0);
  });

  it("dispose flushes a released-but-undelivered setpoint", async () => {
    const { host, controller } = make();
    controller.commit(25);
    expect(host.calls).toHaveLength(0);
    controller.dispose();
    await flush();
    expect(host.calls).toEqual([
      {
        domain: "climate",
        service: "set_temperature",
        data: { entity_id: "climate.test", temperature: 25 },
      },
    ]);
    expect(controller.phase).toBe("idle");
  });
});
