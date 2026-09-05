/* HA lazy-loads its internal ha-control-* components; on a fresh kiosk load
 * they may be undefined and would render inert (plan §Phase 1). Force the
 * frontend to load the chunk that defines them by instantiating a stock
 * thermostat card via the card helpers, then wait for the elements. */

const REQUIRED = ["ha-control-circular-slider", "ha-control-select"] as const;
const LOAD_TIMEOUT_MS = 6000;

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<{
      createCardElement(config: Record<string, unknown>): HTMLElement;
    }>;
  }
}

let loading: Promise<void> | undefined;

export function haControlsDefined(): boolean {
  return REQUIRED.every((tag) => customElements.get(tag) !== undefined);
}

export function ensureHaControls(): Promise<void> {
  if (haControlsDefined()) return Promise.resolve();
  loading ??= (async () => {
    try {
      const helpers = await window.loadCardHelpers?.();
      // Creating the element is enough to trigger the chunk import; it is
      // never attached to the DOM.
      helpers?.createCardElement({ type: "thermostat", entity: "climate.rcc_loader" });
    } catch {
      // Fall through to whenDefined — another card on the view may load them.
    }
    // Never block rendering indefinitely: HA may ship these elements in a
    // chunk we did not trigger, in which case the card degrades rather than
    // showing a permanent placeholder on a kiosk that never reloads.
    await Promise.race([
      Promise.all(REQUIRED.map((tag) => customElements.whenDefined(tag))),
      new Promise((resolve) => setTimeout(resolve, LOAD_TIMEOUT_MS)),
    ]);
  })();
  return loading;
}
