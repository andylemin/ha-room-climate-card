# Room Climate Card

A room-centric climate control card for Home Assistant, built for wall panels.

Each page of the card is a **room's climate** — a rotary temperature dial for the
room's primary HVAC, its full control surface, any secondary thermostats, and the
room's environment sensors. Daikin systems are the first-class target, but the
card talks to standard `climate` entities, so any climate integration works.

> Status: **v0.1 development.** The dial, HVAC mode row, power control, and
> offline/unavailable handling are implemented. The room selector, environment
> strip, sensor panel, and visual editor land in v0.5/v1.0.

## Design goals

- **Touch-first and fast** on modest hardware (the reference target is a Shelly
  Wall Display X2i: 1440×720, quad-core Rockchip). Renders are gated to the
  card's own entities, dial drags update CSS custom properties instead of
  re-rendering, and animation is compositor-only. Bundle budget: ≤ 120 KB gzipped.
- **Capability-driven**: controls appear because the entity reports supporting
  them, never because they were hard-coded.
- **Room-centric**: rooms map to Home Assistant areas by default.

## Installation

### HACS (custom repository)

1. HACS → three-dot menu → **Custom repositories**.
2. Add `https://github.com/andylemin/ha-room-climate-card` with category
   **Dashboard**.
3. Install **Room Climate Card**, then reload the browser.

### Manual

1. Download `room-climate-card.js` from the latest release.
2. Copy it to `<config>/www/room-climate-card.js`.
3. Add the resource: **Settings → Dashboards → ⋮ → Resources → Add resource**,
   URL `/local/room-climate-card.js`, type **JavaScript module**.

## Configuration

```yaml
type: custom:room-climate-card
rooms:
  - living_room                 # an area ID: entities are discovered from it
  - area: bedroom               # or an object, with overrides
    name: Main Bedroom
    primary: climate.bedroom_ac # which climate entity owns the dial
  - entities:                   # or an explicit entity set (no area needed)
      - climate.study_ac
    name: Study
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `rooms` | list | required | Area IDs, or objects with `area` / `entities` |
| `rooms[].name` | string | area or entity name | Display name |
| `rooms[].icon` | string | area icon | Room icon |
| `rooms[].primary` | entity | first climate entity (Daikin preferred) | Climate entity that owns the dial |
| `rooms[].temp_entity` | entity | — | Temperature sensor override |
| `rooms[].humidity_entity` | entity | — | Humidity sensor override |
| `rooms[].power_entity` | entity | — | Power sensor override |
| `default_room` | string | first room | Room shown on load |
| `density` | string | auto | Layout density override |
| `reduce_motion` | boolean | `false` | Suppress non-essential animation |
| `outdoor_sensors` | list | — | Explicit outdoor sensor entities |

### Wall panel setup

Give the card its own dashboard with a single **panel** view, and point the panel
device at that URL (on a Shelly Wall Display, add a navigation button to it from
your default dashboard). A dedicated non-administrator Home Assistant user is
recommended for an always-on display.

## Development

Everything runs in containers — no host toolchain required.

```sh
docker compose run --rm node npm install
docker compose run --rm node npm test          # unit tests
docker compose run --rm node npm run build     # dist/room-climate-card.js
docker compose run --rm node npm run check:bundle
./scripts/deploy.sh                            # build + scp to a dev HA server
```

The card is validated against the latest Home Assistant release at each
development and release cycle; the release notes state the version tested.

## License

GPL-3.0-only. See [LICENSE](LICENSE).
