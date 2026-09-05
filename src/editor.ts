import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";

import type { RoomClimateCardConfig } from "./config";
import { EDITOR_TAG } from "./const";
import type { HomeAssistant } from "./types";

/* Minimal visual editor (scaffold): edits the rooms list as an object via
 * ha-form's object selector. Replaced by a purpose-built rooms editor before
 * v1.0 if the form schema proves insufficient (plan §Phase 1). */

const SCHEMA = [
  { name: "rooms", required: true, selector: { object: {} } },
  { name: "default_room", selector: { text: {} } },
  { name: "reduce_motion", selector: { boolean: {} } },
];

@customElement(EDITOR_TAG)
export class RoomClimateCardEditor extends LitElement {
  public hass?: HomeAssistant;
  @state() private _config?: RoomClimateCardConfig;

  setConfig(config: RoomClimateCardConfig): void {
    this._config = config;
  }

  protected override render(): TemplateResult {
    if (!this.hass || !this._config) return html``;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${SCHEMA}
        .computeLabel=${(schema: { name: string }) => schema.name}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _valueChanged(e: CustomEvent<{ value: RoomClimateCardConfig }>): void {
    const config = e.detail.value;
    this.dispatchEvent(
      new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }),
    );
  }

  static override styles = css`
    ha-form {
      display: block;
      padding: 8px 0;
    }
  `;
}
