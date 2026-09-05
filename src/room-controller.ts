import { DEBOUNCE_MS, DRAG_WATCHDOG_MS, ERROR_DISPLAY_MS, HOLDOFF_MS } from "./const";
import { ClimateFeature, type HassEntityState } from "./types";

/* Host services injected by the card (and by tests): service calls, a
 * re-render request, and a clock. */
export interface ControllerHost {
  callService(
    domain: string,
    service: string,
    data: Record<string, unknown>,
  ): Promise<unknown>;
  requestUpdate(): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export type ControllerPhase = "idle" | "dragging" | "pending" | "holdoff" | "error";

/* Per-room state machine for the primary HVAC (plan §Phase 1 / §Phase 2 dial
 * pipeline): optimistic value while interacting, one debounced service call on
 * release, a hold-off window during which entity echoes never overwrite the
 * optimistic value, a scheduled post-hold-off resync (render gating filters
 * ticks, so no later tick is guaranteed), early release when the echo matches,
 * and a surfaced error state on service failure — a silent snap-back must
 * never be mistaken for device behavior. */
export class RoomController {
  phase: ControllerPhase = "idle";
  errorKey: string | null = null;

  private state?: HassEntityState;
  private optimistic: number | null = null;
  private debounceHandle: unknown = null;
  private holdoffHandle: unknown = null;
  private errorHandle: unknown = null;
  private dragHandle: unknown = null;
  private disposed = false;

  constructor(
    readonly entityId: string,
    private readonly host: ControllerHost,
  ) {}

  /* ---- entity state ---- */

  updateFromState(state: HassEntityState | undefined): void {
    this.state = state;
    if (this.optimistic === null) return;
    // Echo release: entity caught up with the pending value → interaction over.
    if (
      (this.phase === "pending" || this.phase === "holdoff") &&
      state?.attributes.temperature != null &&
      Math.abs(state.attributes.temperature - this.optimistic) < 0.01
    ) {
      this.settle();
    }
  }

  get available(): boolean {
    const s = this.state?.state;
    return s !== undefined && s !== "unavailable" && s !== "unknown";
  }

  get hvacMode(): string | undefined {
    return this.state?.state;
  }

  get hvacAction(): string | undefined {
    return this.state?.attributes.hvac_action;
  }

  get hvacModes(): string[] {
    return this.state?.attributes.hvac_modes ?? [];
  }

  get currentTemperature(): number | null {
    return this.state?.attributes.current_temperature ?? null;
  }

  get stateObj(): HassEntityState | undefined {
    return this.state;
  }

  get minTemp(): number {
    return this.state?.attributes.min_temp ?? 7;
  }

  get maxTemp(): number {
    return this.state?.attributes.max_temp ?? 35;
  }

  get step(): number {
    return this.state?.attributes.target_temp_step ?? 0.5;
  }

  private get features(): number {
    return this.state?.attributes.supported_features ?? 0;
  }

  /* Capability-driven dial variant (plan §Phase 2): feature bit AND a non-null
   * attribute — fan_only/dry report no setpoint even when the bit is set. */
  get supportsTargetTemperature(): boolean {
    return (
      (this.features & ClimateFeature.TARGET_TEMPERATURE) !== 0 &&
      this.state?.attributes.temperature != null
    );
  }

  get supportsTargetRange(): boolean {
    return (
      (this.features & ClimateFeature.TARGET_TEMPERATURE_RANGE) !== 0 &&
      this.state?.attributes.target_temp_high != null &&
      this.state?.attributes.target_temp_low != null
    );
  }

  /* Displayed setpoint: optimistic while interacting, entity truth otherwise
   * (plan §2.1 — the optimistic value lives only inside the interaction
   * window). */
  get displayTemperature(): number | null {
    if (this.optimistic !== null) return this.optimistic;
    return this.state?.attributes.temperature ?? null;
  }

  /* ---- dial math ---- */

  /* Snap to target_temp_step ANCHORED AT min_temp, keeping enough precision for
   * both the step and the anchor — min_temp 10.5 with step 1 yields a x.5 grid
   * (better-thermostat's _snap, plus anchor precision). */
  snap(value: number): number {
    const min = this.minTemp;
    const max = this.maxTemp;
    const step = this.step;
    const clamped = Math.min(max, Math.max(min, value));
    const snapped = min + Math.round((clamped - min) / step) * step;
    const decimals = Math.max(decimalsOf(step), decimalsOf(min));
    return Math.min(max, Number(snapped.toFixed(decimals)));
  }

  /* ---- interaction pipeline ---- */

  /* value-changing: optimistic value only; the card mirrors it via CSS-var
   * writes, no Lit render (plan §1.3). */
  beginDrag(value: number): void {
    if (!this.supportsTargetTemperature) return;
    this.optimistic = this.snap(value);
    // Watchdog: a drag that never commits (pointer cancel, scroll abort) must
    // not leave the optimistic value shadowing entity truth forever.
    if (this.dragHandle !== null) this.host.clearTimer(this.dragHandle);
    this.dragHandle = this.host.setTimer(() => {
      this.dragHandle = null;
      if (this.phase === "dragging") this.cancelInteraction();
    }, DRAG_WATCHDOG_MS);
    if (this.phase !== "dragging") {
      this.phase = "dragging";
      this.host.requestUpdate();
    }
  }

  get isInteracting(): boolean {
    return this.phase === "dragging" || this.phase === "pending" || this.phase === "holdoff";
  }

  /* value-changed: snap, then one debounced set_temperature. */
  commit(value: number): void {
    if (!this.supportsTargetTemperature) return;
    this.clearDragWatchdog();
    this.optimistic = this.snap(value);
    this.phase = "pending";
    if (this.debounceHandle !== null) this.host.clearTimer(this.debounceHandle);
    this.debounceHandle = this.host.setTimer(() => {
      this.debounceHandle = null;
      void this.send();
    }, DEBOUNCE_MS);
    this.host.requestUpdate();
  }

  cancelInteraction(): void {
    this.clearTimers();
    this.optimistic = null;
    this.phase = "idle";
    this.host.requestUpdate();
  }

  async setHvacMode(mode: string): Promise<void> {
    try {
      await this.host.callService("climate", "set_hvac_mode", {
        entity_id: this.entityId,
        hvac_mode: mode,
      });
    } catch {
      this.fail("card.error_set_mode");
    }
  }

  async togglePower(): Promise<void> {
    const service = this.hvacMode === "off" ? "turn_on" : "turn_off";
    try {
      await this.host.callService("climate", service, { entity_id: this.entityId });
    } catch {
      this.fail("card.error_set_mode");
    }
  }

  /* Detached from the DOM: flush a debounced setpoint the user already released
   * (dropping it silently would lose their input and latch a value that was
   * never sent), then reset. */
  dispose(): void {
    const pending = this.phase === "pending" && this.optimistic !== null;
    this.clearTimers();
    if (pending) void this.send();
    this.disposed = true;
    this.optimistic = null;
    this.phase = "idle";
    this.errorKey = null;
  }

  /* ---- internals ---- */

  private async send(): Promise<void> {
    if (this.optimistic === null) return;
    const value = this.optimistic;
    try {
      await this.host.callService("climate", "set_temperature", {
        entity_id: this.entityId,
        temperature: value,
      });
      // A commit made while this call was in flight owns the state now; a
      // disposed controller must not re-enter the state machine.
      if (this.debounceHandle === null && !this.disposed) this.enterHoldoff();
    } catch {
      this.fail("card.error_set_temperature");
    }
  }

  private enterHoldoff(): void {
    this.phase = "holdoff";
    if (this.holdoffHandle !== null) this.host.clearTimer(this.holdoffHandle);
    // Scheduled resync: render gating filters ticks, so explicitly re-read the
    // entity when the hold-off expires.
    this.holdoffHandle = this.host.setTimer(() => {
      this.holdoffHandle = null;
      this.settle();
    }, HOLDOFF_MS);
    this.host.requestUpdate();
  }

  private settle(): void {
    this.clearTimers();
    this.optimistic = null;
    this.phase = "idle";
    this.host.requestUpdate();
  }

  private fail(errorKey: string): void {
    if (this.disposed) return;
    this.errorKey = errorKey;
    if (this.errorHandle !== null) this.host.clearTimer(this.errorHandle);
    this.errorHandle = this.host.setTimer(() => {
      this.errorHandle = null;
      this.errorKey = null;
      if (this.phase === "error") this.phase = "idle";
      this.host.requestUpdate();
    }, ERROR_DISPLAY_MS);
    // A newer commit is already queued: surface the error but leave its
    // optimistic value and debounce timer intact.
    if (this.debounceHandle === null) {
      if (this.holdoffHandle !== null) {
        this.host.clearTimer(this.holdoffHandle);
        this.holdoffHandle = null;
      }
      this.clearDragWatchdog();
      this.optimistic = null;
      this.phase = "error";
    }
    this.host.requestUpdate();
  }

  private clearDragWatchdog(): void {
    if (this.dragHandle !== null) {
      this.host.clearTimer(this.dragHandle);
      this.dragHandle = null;
    }
  }

  private clearTimers(): void {
    for (const handle of [
      this.debounceHandle,
      this.holdoffHandle,
      this.errorHandle,
      this.dragHandle,
    ]) {
      if (handle !== null) this.host.clearTimer(handle);
    }
    this.debounceHandle = this.holdoffHandle = this.errorHandle = this.dragHandle = null;
  }
}

function decimalsOf(value: number): number {
  const text = String(value);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}
