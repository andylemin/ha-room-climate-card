import {
  mdiFan,
  mdiFire,
  mdiPower,
  mdiSnowflake,
  mdiSunSnowflakeVariant,
  mdiThermostatAuto,
  mdiWaterPercent,
} from "@mdi/js";
import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

import { validateConfig, type RoomClimateCardConfig } from "./config";
import { CARD_TAG, CARD_VERSION, EDITOR_TAG, MODE_RGB } from "./const";
import { formatEntityTemperature, formatTemperature } from "./format";
import { ensureHaControls, haControlsDefined } from "./ha-loader";
import { shouldUpdateForHass } from "./has-changed";
import { localize } from "./localize";
import { RoomController, type ControllerHost } from "./room-controller";
import { resolveRooms, type RoomModel } from "./rooms";
import type { HassEntityState, HomeAssistant } from "./types";

const MODE_ICONS: Record<string, string> = {
  off: mdiPower,
  heat: mdiFire,
  cool: mdiSnowflake,
  heat_cool: mdiSunSnowflakeVariant,
  auto: mdiThermostatAuto,
  dry: mdiWaterPercent,
  fan_only: mdiFan,
};

interface SuggestionCandidate {
  config: Record<string, unknown>;
  label?: string;
}

@customElement(CARD_TAG)
export class RoomClimateCard extends LitElement {
  @state() private _config?: RoomClimateCardConfig;
  @state() private _selectedRoom = 0;
  @state() private _controlsReady = haControlsDefined();

  private _hass?: HomeAssistant;
  private _rooms: RoomModel[] = [];
  private _roomsHassRefs: { entities?: unknown; areas?: unknown; devices?: unknown } = {};
  private _controllers = new Map<string, RoomController>();

  /* ---- card contract ---- */

  static getConfigElement(): Promise<HTMLElement> {
    return import("./editor").then(() => document.createElement(EDITOR_TAG));
  }

  static getStubConfig(
    hass: HomeAssistant,
    entities: string[],
    entitiesFallback: string[],
  ): Record<string, unknown> {
    const climate =
      entities.find((id) => id.startsWith("climate.")) ??
      entitiesFallback.find((id) => id.startsWith("climate."));
    if (!climate) return { rooms: [] }; // renders the "no rooms" empty state
    const area =
      hass.entities?.[climate]?.area_id ??
      (hass.entities?.[climate]?.device_id
        ? hass.devices?.[hass.entities[climate].device_id as string]?.area_id
        : null);
    return { rooms: [area ?? { entities: [climate] }] };
  }

  setConfig(config: unknown): void {
    this._config = validateConfig(config);
    this._rooms = [];
    this._roomsHassRefs = {};
    this._selectedRoom = 0;
    // Re-resolve now: the render gate would otherwise leave the card showing
    // the previous (or empty) state until one of its entities next ticks.
    if (this._hass) this._resolveRoomsIfNeeded(this._hass);
  }

  set hass(hass: HomeAssistant) {
    const old = this._hass;
    this._hass = hass;
    this._resolveRoomsIfNeeded(hass);
    if (!shouldUpdateForHass(old, hass, this._watchedEntityIds())) return;
    for (const controller of this._controllers.values()) {
      controller.updateFromState(this._stateFor(controller.entityId));
    }
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  getCardSize(): number {
    return 6;
  }

  getGridOptions(): Record<string, unknown> {
    return { columns: 12, rows: 8, min_rows: 4, min_columns: 6 };
  }

  /* ---- lifecycle ---- */

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this._controlsReady) {
      void ensureHaControls().then(() => {
        this._controlsReady = true;
      });
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const controller of this._controllers.values()) controller.dispose();
  }

  protected override willUpdate(_changed: PropertyValues): void {
    const dark = this._hass?.themes?.darkMode === true;
    this.toggleAttribute("dark-mode", dark);
    this.toggleAttribute("rtl", document.dir === "rtl");
  }

  /* ---- room / controller plumbing ---- */

  private _resolveRoomsIfNeeded(hass: HomeAssistant): void {
    if (!this._config) return;
    const refs = this._roomsHassRefs;
    if (
      this._rooms.length > 0 &&
      refs.entities === hass.entities &&
      refs.areas === hass.areas &&
      refs.devices === hass.devices
    ) {
      return;
    }
    this._rooms = resolveRooms(hass, this._config);
    this._roomsHassRefs = { entities: hass.entities, areas: hass.areas, devices: hass.devices };
    const wanted = new Set(
      this._rooms.map((room) => room.primaryId).filter((id): id is string => Boolean(id)),
    );
    for (const [id, controller] of this._controllers) {
      if (!wanted.has(id)) {
        controller.dispose();
        this._controllers.delete(id);
      }
    }
    for (const id of wanted) {
      if (!this._controllers.has(id)) {
        const controller = new RoomController(id, this._controllerHost());
        controller.updateFromState(hass.states[id]);
        this._controllers.set(id, controller);
      }
    }
    // A registry-only change (device moved into the area, area renamed) does
    // not tick any entity, so the gate would suppress the repaint.
    this.requestUpdate();
  }

  private _controllerHost(): ControllerHost {
    return {
      callService: (domain, service, data) => {
        if (!this._hass) return Promise.reject(new Error("no hass"));
        return this._hass.callService(domain, service, data);
      },
      requestUpdate: () => this.requestUpdate(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
    };
  }

  private *_watchedEntityIds(): Iterable<string> {
    for (const room of this._rooms) yield* room.climateIds;
  }

  private _stateFor(entityId: string): HassEntityState | undefined {
    return this._hass?.states[entityId];
  }

  private get _room(): RoomModel | undefined {
    return this._rooms[Math.min(this._selectedRoom, this._rooms.length - 1)];
  }

  private get _controller(): RoomController | undefined {
    const id = this._room?.primaryId;
    return id ? this._controllers.get(id) : undefined;
  }


  /* ---- render ---- */

  protected override render(): TemplateResult {
    const hass = this._hass;
    if (!this._config || !hass) return html`<ha-card></ha-card>`;
    if (this._rooms.length === 0) {
      return this._wrap(html`<div class="empty">${localize(hass, "card.no_rooms")}</div>`);
    }
    const room = this._room;
    if (!room) return html`<ha-card></ha-card>`;
    if (room.error) {
      return this._wrap(
        html`<div class="empty">${localize(hass, room.error.key, room.error.vars)}</div>`,
        room,
      );
    }
    if (!this._controlsReady) {
      return this._wrap(
        html`<div class="empty">${localize(hass, "card.loading_components")}</div>`,
        room,
      );
    }
    return this._wrap(this._renderRoom(room), room);
  }

  private _wrap(body: TemplateResult, room?: RoomModel): TemplateResult {
    const hass = this._hass;
    const disconnected = hass !== undefined && !hass.connected;
    return html`
      <ha-card>
        ${disconnected
          ? html`<div class="banner">${localize(hass, "card.disconnected")}</div>`
          : nothing}
        <div class="body ${disconnected ? "disabled" : ""}" style=${this._activeRgbStyle()}>
          ${room ? html`<div class="room-name">${room.name}</div>` : nothing}
          ${body}
        </div>
        <div class="version">${CARD_VERSION}</div>
      </ha-card>
    `;
  }

  private _renderRoom(room: RoomModel): TemplateResult {
    const hass = this._hass!;
    const controller = this._controller;
    if (!controller || !room.primaryId) {
      return html`<div class="empty">
        ${localize(hass, "card.room_empty", { room: room.name })}
      </div>`;
    }
    if (!controller.available) {
      return html`
        <div class="dial-area unavailable">
          <div class="dial-center">
            <span class="big">${formatTemperature(hass, null)}</span>
            <span class="sub">${localize(hass, "card.unavailable")}</span>
          </div>
        </div>
      `;
    }
    return html`
      <div class="dial-area">${this._renderDial(controller)}</div>
      ${controller.errorKey
        ? html`<div class="error-toast">${localize(hass, controller.errorKey)}</div>`
        : nothing}
      <div class="controls">
        ${this._renderModeRow(controller)}
        <button
          class="power ${controller.hvacMode === "off" ? "" : "on"}"
          aria-label=${localize(hass, "card.power")}
          @click=${() => void controller.togglePower()}
        >
          <svg viewBox="0 0 24 24"><path d=${mdiPower}></path></svg>
        </button>
      </div>
    `;
  }

  private _activeRgbStyle(): string {
    const controller = this._controller;
    if (!controller?.available) return "";
    const key = controller.hvacAction === "idle" ? "off" : (controller.hvacMode ?? "off");
    return `--rcc-active-rgb: ${MODE_RGB[key] ?? MODE_RGB.off}`;
  }

  private _renderDial(controller: RoomController): TemplateResult {
    const readonly = !controller.supportsTargetTemperature;
    const mode =
      controller.hvacMode === "cool" ? "end" : controller.hvacMode === "heat" ? "start" : "full";
    const value = readonly ? undefined : (controller.displayTemperature ?? undefined);
    return html`
      <ha-control-circular-slider
        .value=${value}
        .current=${controller.currentTemperature ?? undefined}
        .min=${controller.minTemp}
        .max=${controller.maxTemp}
        .step=${controller.step}
        .disabled=${readonly}
        .inactive=${readonly}
        mode=${mode}
        prevent-interaction-on-scroll
        @value-changing=${(e: CustomEvent<{ value: number }>) =>
          this._onDialChanging(controller, e)}
        @value-changed=${(e: CustomEvent<{ value: number }>) =>
          this._onDialChanged(controller, e)}
      ></ha-control-circular-slider>
      <div class="dial-center">
        <span class="big" id="setpoint">
          ${readonly
            ? formatEntityTemperature(
                this._hass,
                controller.entityId,
                "current_temperature",
                controller.currentTemperature,
              )
            : formatTemperature(this._hass, controller.displayTemperature)}
        </span>
        <span class="sub">
          ${localize(this._hass, "card.currently")}
          ${formatEntityTemperature(
            this._hass,
            controller.entityId,
            "current_temperature",
            controller.currentTemperature,
          )}
        </span>
      </div>
    `;
  }

  private _onDialChanging(controller: RoomController, e: CustomEvent<{ value: number }>): void {
    const value = e.detail.value;
    if (value == null) return;
    controller.beginDrag(value);
    // Drag never triggers Lit renders (§1.3): update the readout directly.
    const el = this.renderRoot.querySelector("#setpoint");
    if (el) el.textContent = formatTemperature(this._hass, controller.snap(value));
  }

  private _onDialChanged(controller: RoomController, e: CustomEvent<{ value: number }>): void {
    const value = e.detail.value;
    if (value == null) return;
    controller.commit(value);
  }

  private _renderModeRow(controller: RoomController): TemplateResult {
    const hass = this._hass!;
    const options = controller.hvacModes.map((mode) => ({
      value: mode,
      label: localize(hass, `mode.${mode}`),
      path: MODE_ICONS[mode],
    }));
    return html`
      <ha-control-select
        .options=${options}
        .value=${controller.hvacMode}
        @value-changed=${(e: CustomEvent<{ value: string }>) =>
          void controller.setHvacMode(e.detail.value)}
      ></ha-control-select>
    `;
  }

  /* ---- styles ---- */

  static override styles = css`
    :host {
      --rcc-unit: var(--rcc-unit-override, 40px);
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }
    ha-card {
      position: relative;
      contain: content;
      padding: calc(var(--rcc-unit) * 0.4);
    }
    .banner {
      background: var(--rcc-banner-bg, var(--warning-color, #ffa600));
      color: var(--text-primary-color, #fff);
      text-align: center;
      padding: 6px;
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .body.disabled {
      pointer-events: none;
      opacity: 0.5;
    }
    .room-name {
      font-size: calc(var(--rcc-unit) * 0.5);
      font-weight: 500;
      color: var(--rcc-title-color, var(--primary-text-color));
      margin-bottom: 4px;
    }
    .dial-area {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      --control-circular-slider-color: rgb(var(--rcc-active-rgb, 158, 158, 158));
    }
    ha-control-circular-slider {
      width: 100%;
      max-width: calc(var(--rcc-unit) * 8);
    }
    .dial-center {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }
    .dial-center .big {
      font-size: calc(var(--rcc-unit) * 0.9);
      font-weight: 400;
      color: var(--primary-text-color);
    }
    .dial-center .sub {
      font-size: calc(var(--rcc-unit) * 0.3);
      color: var(--secondary-text-color);
    }
    .dial-area.unavailable {
      min-height: calc(var(--rcc-unit) * 5);
      opacity: 0.6;
    }
    .controls {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 8px;
    }
    ha-control-select {
      flex: 1;
    }
    .power {
      width: calc(var(--rcc-unit) * 1.2);
      height: calc(var(--rcc-unit) * 1.2);
      border-radius: 50%;
      border: none;
      cursor: pointer;
      background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.06);
      color: var(--secondary-text-color);
    }
    .power.on {
      background: rgba(var(--rcc-active-rgb, 33, 150, 243), 0.2);
      color: rgb(var(--rcc-active-rgb, 33, 150, 243));
    }
    .power svg {
      width: 60%;
      height: 60%;
      fill: currentColor;
    }
    .error-toast {
      background: var(--error-color, #db4437);
      color: #fff;
      border-radius: 8px;
      padding: 6px 10px;
      margin: 4px 0;
      text-align: center;
    }
    .empty {
      padding: calc(var(--rcc-unit) * 0.6);
      color: var(--secondary-text-color);
      text-align: center;
    }
    .version {
      position: absolute;
      right: 6px;
      bottom: 2px;
      font-size: 9px;
      opacity: 0.35;
      color: var(--secondary-text-color);
    }
  `;
}

/* ---- registration ---- */

function suggestForEntity(hass: HomeAssistant, entityId: string): SuggestionCandidate | null {
  if (!entityId.startsWith("climate.")) return null;
  const entry = hass.entities?.[entityId];
  const area =
    entry?.area_id ?? (entry?.device_id ? hass.devices?.[entry.device_id]?.area_id : null);
  return {
    config: { type: `custom:${CARD_TAG}`, rooms: [area ?? { entities: [entityId] }] },
  };
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
  interface HTMLElementTagNameMap {
    [CARD_TAG]: RoomClimateCard;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((card) => card.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "Room Climate Card",
    description:
      "Room-centric climate control — rotary dial, room pages, environment sensors. Daikin first-class.",
    preview: false,
    documentationURL: "https://github.com/andylemin/ha-room-climate-card",
    getEntitySuggestion: suggestForEntity,
  });
}

console.info(
  `%c ROOM-CLIMATE-CARD %c ${CARD_VERSION} `,
  "color: white; background: #2196f3; font-weight: 700;",
  "color: #2196f3; background: white; font-weight: 700;",
);
