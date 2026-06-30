# Ocean Plastic Report

Two things built on one open data layer:

1. **Global Plastics Watch** (`web/`) — a public, dependency-free interactive world map of
   where plastic pollution comes from (country emissions + river hotspots), a self-serve
   dashboard, and downloadable open data (CSV / JSON / GeoJSON). **This is the current focus.**
2. **Cost-recovery report** (the Python CLI below) — a per-country source-attribution &
   retribution report. *Set aside for now, kept intact.*

## Global Plastics Watch

```bash
oceanplastic build-data --out web/data    # compile the open dataset from real sources
cd web && python -m http.server 8000      # open http://localhost:8000
```

Real data: Our World in Data country metrics (Jambeck 2015 / Meijer 2021), Lebreton 2017 river
emissions, Natural Earth geometry — all CC-BY / public domain. See [`web/README.md`](web/README.md)
for the data dictionary, sources, and deploy notes. Fully static; hosts on GitHub Pages.

---

## Cost-recovery report (set aside)

A model that ingests **real** ocean-plastic data and turns it into a **report a coastal
city or country can submit to global councils** — showing where the plastic on its shores
came from, and attaching a defensible monetary ask for cost-recovery / retribution.

> ## ⚠️ What this is — and is not
> This system produces a **defensible, probabilistic, advocacy-grade** attribution-and-valuation
> report. It **does not** produce a binding "invoice" that compels payment, because:
> 1. As of mid-2026 **no operative international mechanism** forces a polluter to pay a coastal
>    state for beached plastic.
> 2. Item-level evidence proves **manufactured-in / sold-in**, never **emitted-from**.
>
> Its value is **leverage** — domestic Extended Producer Responsibility (EPR) cost-recovery,
> treaty/regional-seas advocacy, reputational pressure — not an enforceable judgment.
> **Its credibility is its candor about what it cannot prove.** Every design choice honors that.

## The model

Five stages — `INGEST → NORMALIZE → ATTRIBUTE → VALUE → REPORT` — built around two ideas:

1. **No single piece of evidence traces a bottle home**, so the model fuses independent
   channels into a *distribution* over sources and reports **two axes that are never merged**:
   - **Producer responsibility** (from brand audits) — *corporate*, not national.
   - **Emission pathway / source region** (from drift + forensics) — a probabilistic *region*
     and *pathway*, never an emitting country for a single item.
2. **Every claim carries a confidence tier** (A defensible / B probabilistic / C never asserted)
   and **every monetary figure is a band**, never a point estimate.

See [`docs/MODEL.md`](docs/MODEL.md) for the full design.

## Quickstart

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -e .

# Generate a report for the Saint Lucia pilot (live OpenLitterMap + cached BFFP dataset):
oceanplastic report --pilot config/pilot.saint-lucia.yaml                 # -> .md
oceanplastic report --pilot config/pilot.saint-lucia.yaml --format pdf    # polished PDF
oceanplastic report --pilot config/pilot.saint-lucia.yaml --format all    # md + html + pdf
```

Flags: `--format {md,html,pdf,all}` (default `md`), `--commercial` (exclude CC-BY-NC sources),
`--offline` (skip the live OpenLitterMap query), `--out PATH`, `--date YYYY-MM-DD`.

The **PDF** is a government-ready document — cover page, the enforceability ceiling up front,
tier-badged tables, CSS bar charts, callout boxes, an EPR-first legal table, and a running
footer with page numbers. It renders the styled HTML via headless Chrome (set `CHROME_PATH`
if Chrome isn't in the default location) and stamps page numbers with reportlab/pypdf.

Generated examples:
[`output/sample_saint_lucia_report.pdf`](output/sample_saint_lucia_report.pdf) ·
[`.md`](output/sample_saint_lucia_report.md) ·
[`.html`](output/sample_saint_lucia_report.html).

## What's real vs. stubbed (MVP)

| Stage | MVP (this repo) | Full build |
|---|---|---|
| Item observations | **OpenLitterMap live API** (density) | + MDMAP, EEA, NCEI, TIDES |
| Producer attribution | **BFFP / Cowger 2024** (real, CC-BY) | + date-stamp/barnacle pathway forensics |
| Emission baselines | Lebreton 2017 + Jambeck/OWID (real) | + Meijer figshare, gridded GIS |
| Drift / source region | **prior-based STUB** (Tier B, labelled) | OpenDrift ensemble (Copernicus SMOC + ERA5) |
| Valuation | layered, banded (real ranges) | + measured local cost & coastline density |
| Report | EPR-first, tiered, banded | multi-forum auto-framing |

## Project layout

```
config/        pilot + source-registry YAML
src/oceanplastic/
  ingest/      OpenLitterMap, BFFP, baselines connectors
  normalize.py license-tagging gatekeeper
  attribute/   brand (Tier A) · forensic · drift STUB (Tier B) · two-axis fuse
  value/       layered banded valuation
  report/      generator + markdown template
  cli.py       `oceanplastic report ...`
docs/          MODEL · DATA_SOURCES · METHODOLOGY · LEGAL_FRAMING
tests/         license enforcement, brand attribution, banded-valuation guard
```

## Honesty invariants (enforced in code, not just docs)

- **Every record carries a license.** `Observation.license` is required; untracked data
  cannot enter the system. CC-BY-NC sources are *quarantined* and excluded from `--commercial`.
- **Every monetary figure is a band.** A point estimate raises a validation error
  (`ValuationLayer`).
- **The two attribution axes never merge.** There is deliberately no code path that maps an
  item to an emitting country (Tier C).

## Licensing & attribution

This tool reads multiple third-party datasets under their own licenses (see
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) and `config/sources.yaml`). OpenLitterMap is
ODbL (attribution + share-alike); BFFP/Cowger and Lebreton are CC-BY-4.0. Quarantined
sources (Minderoo GPW, Meijer-via-OceanCleanup framing, Ocean Conservancy TIDES) are used for
context only. Resolve every license before any commercial deployment.
