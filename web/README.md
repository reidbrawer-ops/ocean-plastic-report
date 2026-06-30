# Global Plastics Watch — Compare Dashboard (web app)

An open, dependency-free static site: a **structured analytics dashboard** for where ocean
plastic comes from. A world choropleth is one prominent panel among insight cards — built for
the jobs of *find hotspots, compare countries, drill into one, watch trends, and export*.
No build step, no framework — plain HTML/CSS/JS that hosts anywhere (GitHub Pages, Netlify,
S3, `python -m http.server`). Implemented from the design handoff in
`../design_handoff_plastics_compare_dashboard/`.

**Layout:** gradient header (brand · search · About · Export) › KPI strip (4 computed stats) ›
left rail (lens selector · region filter · river toggle · compare basket) › main column
(map panel · Top-emitters / Trend / River-hotspots cards · Compare panel) › country Drawer,
About modal, and Toasts as overlays.

**Four lenses** color the map: Mismanaged waste, Ocean-emission share, Waste per person
(snapshots), and **Waste exports** (a 1988–2024 *time series* with a play/scrub timeline).

Features: warm sextile choropleth + river hotspots, **zoom/pan** (wheel, drag, +/−/⤢),
**country search**, **region filter** that scopes the whole dashboard (dims out-of-scope
countries), a **multi-country Compare** workflow (add from map/rank/drawer, max 6 → side-by-side
table + CSV), a **country drawer** drill-down with an exports sparkline, a **Top-emitters** card,
a **Production / In-ocean trend** card, a **River-hotspots** card (click to zoom to an outlet),
an **About** modal, **Toasts**, and an **Export** menu (map PNG · country CSV · compare CSV).

> Note on time: no per-country **pollution** time series exists (mismanaged/ocean-share/per-capita
> are single-year snapshots), so the only animated *map* lens is **trade exports** (the real
> per-country time series). Ocean-plastic accumulation over time (OECD, regional) appears as the
> "In the ocean now" KPI and the **In ocean** trend line, not as a country-shaded map lens.

## Run locally

The page fetches data files, so it must be served over HTTP (opening `index.html` directly
will not load the data):

```bash
cd web
python -m http.server 8000
# open http://localhost:8000
```

## Single-file build (editable, no server)

The split files (`index.html` + `styles.css` + `app.js` + `data/*`) are the **editable
design** — edit those. To get one self-contained file that renders anywhere with no server
(double-click from disk, email, or hand to a design tool), bundle them:

```bash
oceanplastic bundle          # -> web/gpw-standalone.html (CSS + JS + data inlined)
```

It also regenerates automatically at the end of `oceanplastic build-data`. A tiny fetch-shim
serves the embedded data, so `app.js` is unchanged. The bundle is a generated artifact
(git-ignored) — regenerate it after editing the sources.

## Rebuild the data

The data files in `web/data/` are generated from real sources by the project's CLI:

```bash
oceanplastic build-data --out web/data            # refresh from live sources
oceanplastic build-data --out web/data --offline  # use cached sources only
oceanplastic build-data --out web/data --top-rivers 300
```

## Files

| File | What it is |
|---|---|
| `index.html` | markup + the download menu |
| `styles.css` | all styling (design tokens at the top) |
| `app.js` | vanilla-JS map renderer (equirectangular projection), dashboard, interactions |
| `data/*` | the open dataset (regenerable; see below) |

## Open data — dictionary

All data is **CC-BY**. Modeled estimates; treat as **ordinal / relative, not exact**.

**`data/countries.geojson`** — `FeatureCollection`; each feature `properties`:

| field | meaning | unit |
|---|---|---|
| `iso` | ISO-3166 alpha-3 country code | — |
| `name`, `continent` | country name, continent | — |
| `mis` | mismanaged plastic waste (2019) | tonnes/yr |
| `ocean` | share of global ocean plastic emissions (2019, Meijer 2021) | % |
| `pc` | plastic waste per capita (2010) | kg/person/day |

**`data/rivers.json`** — array of the top river outlets by plastic emission (Lebreton 2017):

| field | meaning | unit |
|---|---|---|
| `lon`, `lat` | outlet coordinates | degrees |
| `mid`, `low`, `high` | annual plastic input (midpoint / low / high) | tonnes/yr |

**`data/production.json`** — the global plastic-production timeline:
`{ label, unit, source, years:[1950,2019], series:[[year, tonnes], …] }`.

**`data/timeline-regions.json`** — OECD accumulated ocean-plastic by macro-region, 2000–2019:
`{ label, unit, resolution:"region", source, years, regions:{<region>:{<year>:tonnes}}, isoRegion:{<ISO3>:<region>} }`.

**`data/timeline-trade.json`** — per-country plastic-waste exports, 1988–2024 (UN Comtrade):
`{ label, unit, resolution:"country", source, years, byIso:{<ISO3>:{<year>:tonnes}} }`.

**`data/countries.csv`**, **`data/rivers.csv`** — flat CSV mirrors of the country/river data.

**`data/meta.json`** — manifest: metric definitions, source list + licences, record counts,
generated date.

## Sources & licences

| Source | Role | Licence |
|---|---|---|
| [Our World in Data — plastic pollution](https://ourworldindata.org/plastic-pollution) (Jambeck 2015 / Meijer 2021) | country emission metrics | CC-BY-4.0 |
| [Lebreton et al. 2017](https://doi.org/10.1038/ncomms15611) — river plastic emissions | river hotspots | CC-BY-4.0 |
| [Natural Earth](https://www.naturalearthdata.com/) 110m Admin-0 | country geometry | Public domain |

## Deploy (GitHub Pages)

Fully static — commit `web/` (including `web/data/`) and it hosts anywhere. A ready-made
workflow is included at [`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml):
it publishes `web/` on every push to `main`. **One-time setup:** repo *Settings → Pages →
Build and deployment → Source = "GitHub Actions"*. All asset paths are relative, so no base-path
config is needed. Shareable deep links work too (e.g. `…/#m=ocean&c=PHL`).

## Honesty notes (carried from the project)

- Metrics are **modeled estimates** and disagree across studies — the map foregrounds *relative*
  hotspots, not precise tonnages.
- The map shows **emission sources**, not where plastic *lands*. "Manufactured-in / emitted-from"
  are different questions (see the project's `docs/METHODOLOGY.md`).
