import type { ControllerHost } from "../src/room-controller";
import type { HassEntityState } from "../src/types";

/* Deterministic host: manual timers + recorded service calls. */
export class FakeHost implements ControllerHost {
  calls: Array<{ domain: string; service: string; data: Record<string, unknown> }> = [];
  updates = 0;
  failNext = false;

  private timers = new Map<number, { fn: () => void; ms: number }>();
  private nextId = 1;

  callService(domain: string, service: string, data: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ domain, service, data });
    return this.failNext
      ? Promise.reject(new Error("service failed"))
      : Promise.resolve(undefined);
  }

  requestUpdate(): void {
    this.updates += 1;
  }

  setTimer(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { fn, ms });
    return id;
  }

  clearTimer(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  /** Fire all pending timers whose delay is <= ms (single pass). */
  advance(ms: number): void {
    for (const [id, timer] of [...this.timers]) {
      if (timer.ms <= ms) {
        this.timers.delete(id);
        timer.fn();
      }
    }
  }

  get pendingTimerCount(): number {
    return this.timers.size;
  }
}

export function climateState(overrides: Partial<HassEntityState> = {}): HassEntityState {
  return {
    entity_id: "climate.test",
    state: "cool",
    last_changed: "",
    last_updated: "",
    ...overrides,
    attributes: {
      friendly_name: "Test AC",
      current_temperature: 27,
      temperature: 24,
      min_temp: 10,
      max_temp: 32,
      target_temp_step: 0.5,
      hvac_modes: ["off", "heat", "cool", "heat_cool", "dry", "fan_only"],
      hvac_action: "cooling",
      supported_features: 1 | 8 | 32 | 128 | 256,
      ...(overrides.attributes ?? {}),
    },
  };
}

export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
