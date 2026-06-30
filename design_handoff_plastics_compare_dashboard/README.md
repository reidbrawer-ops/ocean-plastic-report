# Handoff: Global Plastics Watch — Compare Dashboard

## Overview
An interactive, data-driven dashboard for exploring **where ocean plastic comes from**: a world choropleth map (country emission estimates + river hotspots), four analytical "lenses," region filtering, a multi-country **compare** workflow, a production/ocean-accumulation trend, country drill-down, and open-data export (CSV/PNG).

It is a redesign of an existing single-screen map app, restructured into a **structured analytics layout** where the map is one prominent panel among insight cards — optimized for the primary jobs: *find hotspots, compare countries, drill into one country, watch trends over time, and export.*

---

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype that demonstrates the intended look, layout, data behavior, and interactions. **They are not production code to copy directly.**

The prototype is authored as a single "Design Component" (`Plastics Compare Dashboard.dc.html`) that renders via a small runtime (`support.js`) using a React-class-like pattern (a `Component` class whose `renderVals()` returns `React.createElement(...)` trees). The markup shell lives in the file's `<x-dc>` template; the behavior lives in the logic class.

**Your task:** recreate this design in the target codebase's existing environment (React, Vue, Svelte, SwiftUI, etc.) using its established component library, styling system, and data-fetching patterns. If no environment exists yet, choose the most appropriate framework and implement it there. **Do not ship the `.dc.html` as-is.**

**Highly reusable as-is (framework-agnostic, plain JS):**
- The 6 JSON **data files** in `data/` (the real dataset).
- The **pure functions**: map projection, color-threshold binning, number formatting, river-radius scaling, world-series aggregation. These are documented below and can be lifted verbatim.

**To run the prototype locally for reference:** serve the folder over HTTP (e.g. `python -m http.server`) and open the `.dc.html` — it fetches the `data/` files and needs `support.js` beside it. (Opening via `file://` will fail on `fetch`.)

---

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are specified. Recreate the UI faithfully using your codebase's libraries. The one intentional variable: a small set of **tweakable theme props** (accent color, data ramp, default lens, rivers-on) — see *Configuration* below.

---

## Layout / App Shell

**Desktop (≥ 981px):** fixed full-viewport shell, internal scroll.
```
┌──────────────────────────────────────────────────────────────┐
│ HEADER  (gradient navy)  brand · search · About · Export       │  ~58px
├──────────────────────────────────────────────────────────────┤
│ KPI STRIP  (4 cells, hairline dividers)                        │  auto
├───────────────┬────────────────────────────────────────────────┤
│ RAIL          │ MAIN  (scrolls)                                 │
│ 258px         │  ┌──────────────────────────────────────────┐  │
│ • Lens        │  │ MAP PANEL  (header + map + legend/zoom +   │  │
│ • Region      │  │            timeline when time-lens)        │  │
│ • Rivers      │  └──────────────────────────────────────────┘  │
│ • Compare     │  ┌─────────┐┌─────────┐┌─────────┐  cards row  │
│   basket      │  │ Top     ││ Trend   ││ River   │ (1.1/1/1fr)  │
│               │  │ emitters││         ││ hotspots│              │
│               │  └─────────┘└─────────┘└─────────┘              │
│               │  ┌──────────────────────────────────────────┐  │
│               │  │ COMPARE PANEL (table or empty state)       │  │
│               │  └──────────────────────────────────────────┘  │
│               │  footer (sources · CC-BY · generated date)     │
└───────────────┴────────────────────────────────────────────────┘
```
- App root: `height:100vh; overflow:hidden; display:flex; flex-direction:column`.
- Body row: `display:flex; flex:1; min-height:0`. Rail `width:258px; overflow:auto`. Main `flex:1; min-width:0; overflow:auto; padding:16px`.
- Cards grid: `display:grid; grid-template-columns:1.1fr 1fr 1fr; gap:14px; align-items:start`.
- **Overlays:** country **Drawer** (fixed, right, 380px) and **About modal** (centered, 660px) sit above everything; a **Toast** appears bottom-center.

**Responsive**
- `≤ 980px`: app becomes `height:auto; overflow:visible` (page scrolls). Body stacks to a column; rail becomes a horizontal wrapping row of its 4 sections (`flex:1 1 210px` each); cards collapse to 1 column; drawer goes full-width.
- `≤ 620px`: KPI strip becomes 2 columns; header subtitle hidden; main padding 11px.

---

## Screens / Views & Components

### 1. Header (top bar)
- **Container:** `padding:13px 20px; background:linear-gradient(180deg,#11314a,#0c1e2e); color:#fff; flex; gap:14px; flex-wrap:wrap`.
- **Brand mark:** 30×30 inline SVG — `#0c1e2e` filled circle, `#3fd0e6` ring (1.4px, 0.5 opacity), two cyan "wave" stroke paths (`#3fd0e6` 2.2px and `#2a90a8` 1.7px @ .7 opacity).
- **Wordmark:** "Global Plastics **Watch**" — IBM Plex Sans 700, 16px; "Watch" in `--cyan #3fd0e6`. Subtitle below: IBM Plex Mono 11px, `#9db4c9`, "Where ocean plastic comes from".
- **Search input:** 168px; `background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.22); color:#fff; padding:8px 11px; radius:8px`. Placeholder `#9db4c9`; focus border `--cyan`. Backed by a `<datalist>` of all country names; exact-name match selects that country.
- **About & data button:** ghost — transparent, `1px solid rgba(255,255,255,.22)`, text `#dbe7f0`, `padding:8px 13px; radius:8px`, IBM Plex Sans 600 12.5px. Hover: `background:rgba(255,255,255,.13)`.
- **Export button:** filled accent (`--accent`), white text, `padding:8px 14px; radius:8px`, 600 12.5px, leading "⤓" glyph. Opens a dropdown menu (see *Export*).

### 2. KPI Strip
- **Grid:** `repeat(4,1fr); gap:1px; background:#dde5ec` (the gap shows as hairline dividers). Each cell: white, `padding:14px 18px`.
- **Each KPI:** big value in **Newsreader 500, 30px, `#0c1e2e`, letter-spacing -0.5px**, with a small **IBM Plex Mono 600 12px `--accent`** unit beside it; then a label (IBM Plex Sans 600 11.5px `#33485a`) and a sub (IBM Plex Mono 10.5px `#8b98a3`).
- **The four KPIs (computed from data, not hardcoded):**
  1. `61.7M` **t/yr** — "Mismanaged plastic" / "littered, dumped or burned · 2019" (= Σ country `mis`).
  2. `30.4M` **t** — "In the ocean now" / "×3.6 since 2000" (= Σ regional ocean-accumulation latest year; ratio vs 2000).
  3. `150` **rivers** — "Carry most of it" / "≈1.3M t/yr to the sea" (count of river outlets; Σ `mid`).
  4. `460M` **t/yr** — "Plastic produced" / "×230 since 1950" (production latest; ratio vs 1950).

### 3. Rail — Lens selector
- Section label: IBM Plex Mono 600 10.5px uppercase, letter-spacing .9px, `#7c8b97` — "LENS — COLOR THE MAP BY".
- Four selectable rows (`width:100%; radius:9px; padding:9px 11px; margin-bottom:7px`):
  - **Unselected:** white, `1px solid #dde5ec`. Hover: border `--accent`.
  - **Selected:** `background:#0c1e2e; border:#0c1e2e`; label white; unit `#9db4c9`.
  - **Label:** IBM Plex Sans 600 13px. **Unit (sub):** IBM Plex Mono 500 10.5px.
  - The time-based lens shows a small **"TIME"** pill (mono 8.5px, accent text, bordered, radius 5px).
- **The four lenses:**
  | key | Label | Unit | Type |
  |---|---|---|---|
  | `mis` | Mismanaged waste | tonnes / year | snapshot |
  | `ocean` | Ocean-emission share | % of world | snapshot |
  | `pc` | Waste per person | kg / person / day | snapshot |
  | `exports` | Waste exports | tonnes / year | **time series** (1988–2024) |

### 4. Rail — Filter by region
- Label row with a "reset" link (accent, appears only when a filter is active).
- Six continent **pills** (`Asia, Africa, Europe, North America, South America, Oceania`): `radius:20px; padding:5px 11px`; IBM Plex Sans 600 11.5px.
  - Off: white, `1px solid #dde5ec`, text `#48586a`. On: `background:--accent; border:--accent; color:#fff`.
- Empty selection = no filter (all in scope). Selecting any subset **scopes the whole dashboard** (see Interactions).

### 5. Rail — River hotspots toggle
- A full-width toggle button (`radius:9px; padding:8px 11px; 1px solid #dde5ec`): a 34×18 pill switch (on = `--accent`, knob slides 2→18px) + label ("Showing 150 outlets" / "Hidden") + a small `#1565c0` dot at .62 opacity.

### 6. Rail — Compare basket
- Label row with a "clear" link (accent, when non-empty).
- **Empty state:** helper copy (IBM Plex Sans 500 11.5px `#9aa7b2`) instructing how to add countries.
- **Chips:** `background:#eaf3f4; border:1px solid #cfe3e6; color:#0c4f57; radius:7px; padding:4px 6px 4px 9px`; 600 11.5px; trailing "×" remove (opacity .5 → 1 on hover). Max **6** countries (toast warns past the limit).

### 7. Map Panel (the centerpiece)
- **Card:** white, `1px solid #dde5ec; radius:12px; box-shadow:0 1px 2px rgba(12,30,46,.04); overflow:hidden`.
- **Header:** `padding:13px 16px; border-bottom:1px solid #eef2f5`. Lens label in **Newsreader 500 19px `#0c1e2e`** + unit (mono 600 11px `--accent`); blurb beneath (IBM Plex Sans 500 11.5px `#8b98a3`). When a region filter is active, a right-aligned scope badge (mono 11px, `#f1f5f8` chip): "scoped: Asia, …".
- **Map area:** `position:relative; height:min(52vh,440px); background:#e7eef3` (sea).
  - **SVG choropleth** — `preserveAspectRatio:xMidYMid meet`, viewBox driven by zoom/pan (base `0 14 720 292`).
    - **Projection (equirectangular):** `x = (lon + 180) * 2`, `y = (90 - lat) * 2`.
    - **Country paths** built from GeoJSON Polygon/MultiPolygon rings. Fill = sextile bin color (below). Stroke: white 0.4px default; **selected** `#0c1e2e` 1.7px; **in compare** `--accent` 1.4px. Out-of-scope (filtered) countries: `opacity:0.2`. Hover: stroke `#0c1e2e` 1.2px (`transition:opacity .16s`).
    - **River circles** (when on): `fill:#1565c0; fill-opacity:.6; stroke:#fff .4px`; radius `1.2 + sqrt(mid / maxMid) * 7`. Hover → `fill-opacity:.95`.
  - **Tooltip:** absolutely positioned, follows cursor (+14/+12 px); `background:#0c1e2e; color:#fff; padding:6px 9px; radius:7px`; IBM Plex Sans 500 11.5px; shows country/outlet name + active value. (Updated imperatively to avoid re-rendering 176 paths on mousemove.)
  - **Legend** (bottom-left, `left:14px; bottom:14px`): white .95 card, `1px solid #dde5ec; radius:9px; padding:10px 12px; box-shadow:0 2px 10px rgba(12,30,46,.08)`. Title = lens label (+ year for time lens). 6 swatches (16×11, radius 2) labeled lowest / `≥ <threshold>` / highest, then a no-data swatch, then (if rivers on) a "river outlet · size = input" row.
  - **Zoom controls** (top-right, `right:14px; top:14px`): three 30×30 buttons (`+`, `−`, `⤢` reset), white .95, `1px solid #dde5ec; radius:8px; box-shadow:0 1px 4px rgba(12,30,46,.1)`.
- **Timeline bar** (only for the `exports` time lens): `padding:11px 16px; border-top:1px solid #eef2f5; background:#fafbfc`. Play/pause circular button (34px, `--accent`); big year (Newsreader 22px) + "year" caption; a label + current value (accent), an area sparkline (600×34, area `#dce6ef`, line `--accent` 1.6, vertical marker `#0c1e2e`, marker dot `--accent`), and a native range `<input>` (accent-colored) over the year indices.

### 8. Card — Top emitters
- Heading "Top emitters" (IBM Plex Sans 600 14.5px) + sub "by <lens> [· year]" (mono 10.5px `#8b98a3`).
- Up to **12 rows** (respecting the region filter), each a clickable `.row` (`padding:5px 6px; radius:7px`; hover `background:rgba(14,116,144,.08)`):
  - rank # (mono 10px `#aeb9c2`, 15px wide, right-aligned)
  - name (IBM Plex Sans 600 12px `#1f3140`, 92px, ellipsis)
  - bar track (`height:9px; background:#eef2f5; radius:5px`) with `--accent` fill (`width = v/max*100%`)
  - value (mono 600 10.5px `#6b7c89`, 62px, right)
  - a trailing **add-to-compare** affordance (18×18, "+" → "✓" when added) that appears on row hover (`.row:hover .add{opacity:1}`); click toggles compare (stops propagation).
- Row click selects the country (opens drawer).

### 9. Card — "The material explosion" (trend)
- Heading + a 2-button segmented toggle: **Production** / **In ocean** (on = `#0c1e2e` fill white text; off = white `#dde5ec` border `#6b7c89`).
- **Area chart** (300×118, `preserveAspectRatio:none`): gradient fill from `--accent` @ .28 → .02; line `--accent` 2px. X-end labels (mono 9.5px `#9aa7b2`) = first/last year.
- Below: big last value (Newsreader 23px) + unit (mono 600 11px accent), then a sentence: Production → "Annual output is up ×230 since 1950 — a material explosion."; In ocean → "Plastic in the ocean has grown ×3.6 since 2000."

### 10. Card — River hotspots
- Heading + "top 10 of 150". Ten rows (clickable → zoom map to that outlet at scale 5.5): rank, a `#1565c0` dot (.66), coordinate "lat, lon" (mono 600 11px `#48586a`), a blue bar (`#1565c0` @ .72), value (mono 600 10.5px).

### 11. Compare Panel
- Heading "Compare countries" + count; actions (when non-empty): **⤓ Export CSV** (white/bordered) and **Clear all** (ghost-bordered).
- **Empty state:** dashed box (`1px dashed #d4dde4; radius:10px; background:#fafbfc; padding:26px 18px; text-align:center`) — Newsreader 16px heading "Build a side-by-side comparison" + helper copy.
- **Table (when populated):** CSS grid `170px repeat(N, minmax(96px,1fr)); gap:1px; background:#eef2f5` (hairlines). Header row = country names (Newsreader-free; IBM Plex Sans 600 13px) each with a "×" remove. Rows: **Mismanaged waste**, **Ocean-emission share**, **Waste per person** — each cell shows the formatted value (mono 600 13.5px `#0c1e2e`) + "rank N of M" (mono 10px `#9aa7b2`); plus an **Exports trend** row with a per-country mini-sparkline (72×20, `--accent` line).

### 12. Country Drawer (drill-down)
- **Overlay:** `position:fixed; inset:0; background:rgba(8,20,32,.32); justify-content:flex-end`. Clicking the backdrop closes.
- **Panel:** `width:380px (100% on mobile); height:100%; background:#fff; overflow:auto; box-shadow:-12px 0 40px rgba(8,20,32,.2); animation:slide-in .22s`.
- **Sticky header:** navy gradient; country name in **Newsreader 24px**; "continent · ISO" (mono 11px `#9db4c9`); close "×" button (`rgba(255,255,255,.12)`, 30×30, radius 8).
- **Body:** three stat cards (`1px solid #e6ecf1; radius:10px; padding:11px 13px`) — Mismanaged (highlighted with `background:#fff7f1`), Ocean share, Per capita — each: mono uppercase label, Newsreader 23px value, "rank N of M". If trade data exists, an **exports-over-time** area chart (320×64). Then actions: **+ Add to compare** (accent; becomes "✓ In compare — remove" / white when added) and **⤢ Zoom** (white bordered). Footer caveat (mono 11px `#9aa7b2`).

### 13. About modal
- Centered (`rgba(8,20,32,.5)` backdrop); white card `radius:14px; max-width:660px; max-height:86vh; overflow:auto`. Sticky navy header (Newsreader 21px) + close. Body: intro paragraph, **Lenses** list, **Sources & licences** (each source = name link + role + license pill `#eaf3f4`/`#0c4f57`), **How to read it** caveats (`background:#fff7f1; border-left:3px solid #d4521b`), generated-date line. Content is built from `data/meta.json`.

### 14. Toast
- Bottom-center, `#0c1e2e` pill, white 600 12.5px, `box-shadow:0 10px 30px rgba(8,20,32,.32)`, auto-dismiss after 1900ms. Used for "added to compare", "CSV downloaded", etc.

---

## Interactions & Behavior
- **Lens change** → recolor all countries (new thresholds), relabel legend/header, refresh Top-emitters & ranks; show the timeline bar only for `exports`.
- **Region filter** → toggling continents dims out-of-scope countries on the map (`opacity .2`), filters the Top-emitters list, and shows a scope badge. Empty = everything in scope.
- **River toggle** → show/hide the 150 river circles + legend row.
- **Map hover** → tooltip (imperative DOM update, no re-render). **Map click** (only if not a drag) → select country → open Drawer + **animated zoom-to-country** (eased viewBox tween ~430ms). Clicking the selected country again deselects + resets view.
- **Ranking row click** → select country. **Row hover "+"** → add/remove from compare (no drawer).
- **River row click** → animated zoom to that outlet (scale 5.5).
- **Compare** → add via Drawer or ranking "+"; chips removable in rail; the Compare panel renders a side-by-side table; **Export CSV** downloads the set. Max 6.
- **Timeline** (exports) → range slider scrubs the year (recolors map + ranks); **Play** advances one year per **360ms** until the end, then stops.
- **Export menu** (header) → **Map image (PNG)** (serializes the current SVG view to a 1440-wide canvas, fills `#eef2f5`, downloads); **Country data CSV** (all countries, current lens columns); **Compare set CSV** (disabled when empty).
- **Search** → datalist of country names; an exact match selects that country.
- **Zoom/pan** → buttons (±/reset), mouse drag to pan, wheel to zoom; scale clamped **1–9**; viewBox clamped to the world bounds. View changes are applied **imperatively** to the live `<svg>` (no React re-render).
- **Esc** closes (in priority) About → Export menu → Drawer.

### Animations (keyframes / timings)
- Drawer slide-in: translateX(24px)+opacity, **.22s ease**.
- Menus/toast fade: **.12–.15s**.
- Map zoom tween: requestAnimationFrame, **~430ms**, ease `t<.5 ? 2t² : 1-(-2t+2)²/2` (easeInOutQuad).
- Spinner: 360° **.8s linear infinite**. Skeletons: shimmer gradient **1.3s**.
- Transitions: country `opacity .16s`; rows `background .12s`; toggles/buttons `.12–.15s`.

---

## State Management
Component state (all reactive):
- `loaded` (bool), `err` (string|null)
- `lens` ∈ `mis|ocean|pc|exports` — current map coloring
- `year` (number) — active year for the time lens (defaults to latest exports year)
- `regions` (string[]) — selected continents; empty = all
- `rivers` (bool) — show river outlets
- `selIso` (string|null) — country whose drawer is open
- `compare` (string[]) — ISO codes in the compare basket (max 6)
- `trendMode` ∈ `prod|ocean` — trend card series
- `playing` (bool), `exportOpen` (bool), `aboutOpen` (bool), `search` (string), `toast` (string|null)

Non-reactive (mutated imperatively, applied straight to the SVG to avoid re-render): `view = {scale, cx, cy}` and pointer/pan tracking. Map projection paths and feature bounding boxes are **precomputed once** after load and cached on each feature.

### Data fetching
On mount, `Promise.all` fetches all 6 JSON files from `data/`. While pending, show skeletons/spinner; on failure show an inline error. After load: precompute paths/bboxes, sort rivers desc, build the world exports series and world ocean-accumulation series, and compute the four KPI aggregates.

---

## Pure functions (reusable verbatim)
```js
// Equirectangular projection into the 720×360 canvas (viewBox base "0 14 720 292")
const proj = (lon, lat) => [(lon + 180) * 2, (90 - lat) * 2];

// Sextile color binning
function thresholds(values /* non-null, sorted asc */) {
  const q = [];
  for (let i = 1; i < 6; i++) q.push(values[Math.floor(i / 6 * values.length)]);
  return q; // 5 breakpoints -> 6 bins
}
function color(val, th, PAL, NODATA) {
  if (val == null || isNaN(val)) return NODATA;
  let i = 0; while (i < th.length && val >= th[i]) i++;
  return PAL[i];
}

// River marker radius (max = largest mid, rivers sorted desc)
const riverR = (mid, max) => 1.2 + Math.sqrt(mid / max) * 7;

// Formatting
const fmtT = v => v==null||isNaN(v) ? 'no data'
  : v>=1e6 ? (v/1e6).toFixed(1)+'M t' : v>=1e3 ? (v/1e3).toFixed(0)+'k t' : Math.round(v)+' t';
function fmtSnap(metric, v){ if(v==null) return 'no data';
  return metric==='mis' ? fmtT(v) : metric==='ocean' ? v.toFixed(2)+'%' : v.toFixed(3)+' kg'; }
const compact = v => v>=1e9?(v/1e9).toFixed(1)+'B' : v>=1e6?(v/1e6).toFixed(v>=1e8?0:1)+'M'
  : v>=1e3?(v/1e3).toFixed(0)+'k' : ''+Math.round(v);
```

---

## Design Tokens

### Color
| Token | Hex | Use |
|---|---|---|
| page-bg | `#eef2f5` | app background |
| panel | `#ffffff` | cards, rail, KPI cells |
| ink | `#0c1e2e` | primary text, selected stroke |
| ink-2 | `#33485a` / `#1f3140` / `#48586a` | secondary text |
| muted | `#6b7c89` / `#8b98a3` / `#9aa7b2` / `#7c8b97` | tertiary text, captions |
| line | `#dde5ec` (strong), `#eef2f5` (soft), `#e6ecf1` (drawer) | borders/dividers |
| header | `linear-gradient(180deg,#11314a,#0c1e2e)` | top bar, drawer/modal headers |
| **accent** (tweak) | `#0e7490` *(default)*; options `#1565c0`, `#0f7a6b`, `#2596be` | UI accent: buttons, fills, selection |
| cyan | `#3fd0e6` | "Watch", brand wave, search focus |
| sea | `#e7eef3` | map ocean / PNG bg |
| no-data | `#d8e0e6` | unfilled countries |
| river | `#1565c0` @ .6–.72 opacity | river outlets |
| hot stat bg | `#fff7f1`; accent rule `#d4521b` | drawer highlighted stat, caveats |
| compare chip | bg `#eaf3f4`, border `#cfe3e6`, text `#0c4f57` | basket chips, license pills |

**Data ramps (choropleth, sequential, 6 steps; `ramp` tweak):**
- warm *(default)*: `#fde2c4 #fbc985 #f6a049 #ee7a2d #d4521b #991f0f`
- teal: `#d4ebee #a3d8dd #69bfc7 #36a0aa #1d7882 #0c4f57`

### Typography
- **Display serif — Newsreader** (400/500/600): KPI values 30px; map header 19px; drawer name 24px; stat & trend values 23px; about title 21px; empty-state 16px. Tighten letter-spacing ~ -0.5px on large numerals.
- **UI — IBM Plex Sans** (400/500/600/700): card headings 14.5–15px/600; brand 16px/700; body 11.5–13px; buttons 12.5px/600.
- **Mono — IBM Plex Mono** (400/500/600): labels/units/axis 8–11px, uppercase section labels letter-spacing .5–.9px.
- Google Fonts import:
  `https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap`

### Radius
cards `12px` · buttons/inputs `8px` · lens rows `9px` · stat cards/legend `10px` · small chips `5–7px` · pills `20px` · drawer/modal `14px`.

### Shadow
- card: `0 1px 2px rgba(12,30,46,.04)`
- legend: `0 2px 10px rgba(12,30,46,.08)`; zoom btn: `0 1px 4px rgba(12,30,46,.1)`
- export menu: `0 14px 38px rgba(12,30,46,.22)`
- drawer: `-12px 0 40px rgba(8,20,32,.2)`; modal: `0 30px 80px rgba(8,20,32,.45)`; toast: `0 10px 30px rgba(8,20,32,.32)`

### Spacing
card padding 14–15px · cards gap 14px · rail section padding 14–15px · main padding 16px (11px ≤620px) · KPI cell 14px 18px.

---

## Configuration (tweakable props)
These are theme/behavior switches, not per-element edits:
- `defaultLens` — `mis | ocean | pc | exports` (default `mis`).
- `riversOn` — boolean (default `true`).
- `accent` — UI accent color; keep on the cool/ocean palette (defaults `#0e7490`).
- `ramp` — choropleth ramp `warm | teal` (default `warm`).

---

## Data
Six JSON files in `data/` (all **CC-BY**). Shapes:
- **`countries.geojson`** — `FeatureCollection`, 176 features. `properties`: `iso`, `name`, `continent`, `mis` (mismanaged tonnes/yr, 2019, nullable), `ocean` (% of world ocean emissions, nullable), `pc` (kg/person/day, 2010, nullable). `geometry`: Polygon/MultiPolygon in lon/lat. 132 countries have data.
- **`rivers.json`** — array of 150 `{lon, lat, mid, low, high}` (tonnes/yr of plastic to the sea; `mid` is the central estimate).
- **`production.json`** — `{label, unit, years:[1950,2019], series:[[year, tonnes], …]}` (global annual production).
- **`timeline-regions.json`** — `{label, unit, years:[2000,2019], regions:{<OECD region>:{<year>:tonnes}}}` (ocean accumulation; summed to a world series for the trend/KPI).
- **`timeline-trade.json`** — `{label, unit, years:[1988,2024], byIso:{<ISO>:{<year>:tonnes}}}` (plastic-waste exports; the `exports` lens + per-country sparklines).
- **`meta.json`** — metric labels/units/years/sources, `counts`, `timeline`, `timeLayers`, `sources` (name/url/license/role), `generated` date. Drives the About modal and footer.

**Sources:** Our World in Data (Jambeck 2015, Meijer 2021, Geyer 2017), Lebreton et al. 2017 (rivers), OECD Global Plastics Outlook, UN Comtrade, Natural Earth (geometry). All estimates are **modeled** — present as relative hotspots, not exact tonnages.

> Note: the prototype intentionally **drops** the OECD regional "ocean over time" *map* lens (it required approximate country→region shading). Ocean accumulation appears only as a world-level KPI + trend line. If you want it back as a 5th lens, the regional data is in `timeline-regions.json`.

## Assets
- **Brand mark:** inline SVG (no external file) — recreate or replace with the codebase's logo. If you have an official Global Plastics Watch brand system, use it.
- **No raster images / icon fonts** — all glyphs are Unicode (▶ ⤓ ⤢ × ✓ ＋ ‹ ›) and small inline SVGs (charts, sparklines, map). Swap glyphs for your icon set.
- **Fonts:** Google Fonts (Newsreader, IBM Plex Sans, IBM Plex Mono).

## Files in this bundle
- `Plastics Compare Dashboard.dc.html` — the hi-fi prototype (template shell + logic class).
- `support.js` — the runtime needed to open the prototype in a browser (reference only; do not port).
- `data/` — the six real data files (reuse directly).
- `README.md` — this document.
