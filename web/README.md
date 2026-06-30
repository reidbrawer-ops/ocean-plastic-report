# Global Plastics Watch — web app

An open, dependency-free static site: an interactive world map of where plastic pollution
comes from (country emissions + river hotspots), a self-serve dashboard, a global
production timeline, and downloadable open data. No build step, no framework — plain
HTML/CSS/JS that hosts anywhere (GitHub Pages, Netlify, S3, `python -m http.server`).

Features: choropleth with a metric switcher, river-hotspot overlay, **zoom/pan** (wheel,
drag, or the +/−/⤢ controls), **country search**, click a country to drill in (click again to
deselect), a **continent/region rollup** in the dashboard (for additive metrics, incl. the trade layer),
**animated time layers** that change the map year-by-year, a **narrated Story tour** (the ▶ Story
button — also deep-linkable via `?story=1`), an **About the data** panel, shareable URLs, and a
download menu.

**Animated time layers** (the timeline scrubs/plays and recolors the map):
- *Plastic in oceans (over time)* — OECD accumulated ocean-plastic, **2000–2019**, at 9 macro-region
  resolution (every country shaded by its region). On-theme pollution.
- *Plastic waste exports (trade)* — UN Comtrade, **1988–2024**, true per-country (the global
  waste-trade story, e.g. China's 2018 import ban). This is *trade*, not pollution.

> Why two resolutions? No per-country **pollution** time series exists — every per-country
> pollution metric (mismanaged, ocean-share, per-capita) is a single-year snapshot. The only
> real multi-year pollution data is regional (OECD); the only real per-country time series is
> trade. The map is honest about which is which.

## Run locally

The page fetches data files, so it must be served over HTTP (opening `index.html` directly
will not load the data):

```bash
cd web
python -m http.server 8000
# open http://localhost:8000
```

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
