export const CARD_VERSION = "0.1.0-dev";
export const CARD_TAG = "room-climate-card";
export const EDITOR_TAG = "room-climate-card-editor";

/* Dial interaction pipeline timings (plan §Phase 2). */
export const DEBOUNCE_MS = 1000;
export const HOLDOFF_MS = 3000;
export const DRAG_WATCHDOG_MS = 5000;
export const ERROR_DISPLAY_MS = 5000;

/* HVAC mode → RGB triplet theme tokens (Mushroom palette). Consumed as
 * rgba(var(--rcc-rgb-mode-x), alpha); overridable via themes. */
export const MODE_RGB: Record<string, string> = {
  heat: "255, 87, 34",
  cool: "33, 150, 243",
  dry: "255, 152, 0",
  fan_only: "0, 150, 136",
  heat_cool: "76, 175, 80",
  auto: "76, 175, 80",
  off: "158, 158, 158",
};
