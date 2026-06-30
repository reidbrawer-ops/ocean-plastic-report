# The Model

How real ocean-plastic data becomes a report a coastal city/country can submit to global
councils to seek financial retribution — and the hard constraints that shape every part of it.

## 0. The load-bearing constraint

Two facts, verified in the research pass, govern the entire design:

1. **No enforceable forum exists.** As of mid-2026 there is no operative international
   mechanism that compels a polluting state or company to pay a coastal state for beached
   plastic (see [`LEGAL_FRAMING.md`](LEGAL_FRAMING.md)).
2. **Item evidence proves the wrong thing.** A label proves *manufactured-in / sold-in*. It
   does **not** prove *emitted-from*. The global waste-export trade severs these further.

So the model is **not** an invoice generator. It is a transparent, range-based,
tier-labelled **evidence-and-leverage engine**. A report that overclaims is dismissed at the
first wall (attribution, standing, or jurisdiction). A report that is candid about its own
limits survives scrutiny. **Candor is the product.**

## 1. Pipeline

```
INGEST ──▶ NORMALIZE ──▶ ATTRIBUTE ──▶ VALUE ──▶ REPORT
  │            │             │            │          │
  │            │             │            │          └─ submission doc: ceiling up top,
  │            │             │            │             two axes, tiers, bands, limitations
  │            │             │            └─ layered, banded USD (cleanup, tourism,
  │            │             │               ecosystem, lifecycle, credit)
  │            │             └─ TWO axes, never merged:
  │            │                producer (Tier A)  ·  pathway/region (Tier B)
  │            └─ canonical schema + license stamped per record (gatekeeper)
  └─ OpenLitterMap (live) · BFFP/Cowger · Lebreton/Jambeck · (full build: Copernicus+OpenDrift)
```

Each stage maps to a module under `src/oceanplastic/`:

| Stage | Module | Role |
|---|---|---|
| Ingest | `ingest/openlittermap.py` | Local observation density (live API) |
| Ingest | `ingest/bffp.py` | Producer attribution backbone (BFFP/Cowger) |
| Ingest | `ingest/baselines.py` | Country/river emission baselines + uncertainty anchor |
| Normalize | `normalize.py` | License-tag every record; dedupe; commercial-safe filter |
| Attribute | `attribute/brand.py` | Producer axis (Tier A) |
| Attribute | `attribute/forensic.py` | Item sector + polymer (Tier A) |
| Attribute | `attribute/drift.py` | Pathway + source-region prior (Tier B **STUB**) |
| Attribute | `attribute/fuse.py` | Assemble the two-axis result |
| Value | `value/valuation.py` | Layered, banded monetary estimate |
| Report | `report/generate.py` + template | Render the submission document |

## 2. The two axes (the core idea)

No single channel can name a culprit, so the model fuses channels into **distributions** and
reports them on two axes that are **never combined into "Country X owes us"**:

### Axis 1 — Producer responsibility *(Tier A — corporate)*
From brand audits: the share of *branded* items belonging to each parent company. This is
**corporate**, never national. It carries three mandatory disclosures (the ~half-unbranded
blind spot, count-not-mass, non-standardized brand strings).

### Axis 2 — Emission pathway & source region *(Tier B — probabilistic)*
From drift backtracking + forensics: a probability split across pathways (coastal land /
riverine / fisheries-shipping) and across source *regions*. Never a country for a single item.

In the MVP, Axis 2 is a **prior-based STUB** (clearly labelled). The full build replaces it
with an OpenDrift / OceanParcels backtracking ensemble (see [`METHODOLOGY.md`](METHODOLOGY.md)).

## 3. Confidence tiers

Every claim is tagged (`schema.Tier`):

- **Tier A — defensible:** producer of a *branded* item; material type; item sector.
- **Tier B — probabilistic (disclose CIs):** source region / emission pathway from drift+forensics.
- **Tier C — never asserted as fact:** the emitting *country* of a specific item; a single
  deterministic origin; an exact per-country tonnage "invoice."

There is deliberately **no function in the codebase** that produces a Tier-C claim.

## 4. Valuation philosophy

Convert attributed plastic into money by **layering** methods and presenting **bands**:

| Layer | Role | Source of the range |
|---|---|---|
| Local cleanup cost | **headline** | bottom-up local $/kg (most defensible) |
| Tourism / fisheries at risk | **headline** | revenue × debris-deterrence % |
| Ecosystem-service value | context | UNEP/GESAMP $3,300–33,000/t |
| Full-lifecycle social cost | comparator | WWF/Dalberg $19–150/kg (overstates; bundles GHG/health) |
| Plastic-credit price | cross-check | World Bank/Verra $140–800/t (contested) |

Headline ask = the two defensible layers. Everything else is context/comparator/cross-check,
explicitly labelled. The Strokal-2023 top-down anchor is cited so the bands aren't accused of
cherry-picking the high end. Details in [`METHODOLOGY.md`](METHODOLOGY.md).

## 5. Honesty invariants (enforced in code)

1. **License provenance** — `Observation.license` is required (`schema.py`); `normalize.py`
   stamps it from `config/sources.yaml`; unknown sources raise; CC-BY-NC are quarantined.
2. **No point estimates** — every quantitative claim is a `Band` (low ≤ central ≤ high); a
   `ValuationLayer` with a degenerate band raises.
3. **Axes never merge** — `fuse.py` returns separate `producer_axis` and `pathway_axis` /
   `region_axis`; the consumed-in country breakdown is attached only as a labelled confound.

These are covered by `tests/` (`test_normalize.py`, `test_brand.py`, `test_valuation.py`).

## 6. Configuration

- `config/sources.yaml` — the source registry (license, commercial_ok, role per source).
- `config/pilot.<name>.yaml` — a pilot coastline: bounding box, coastline length, local
  cleanup economics, tourism exposure, the BFFP regional-country filter, and the drift
  region prior. **Numbers marked "illustrative" are defaults to be replaced with measured
  local values** before any real submission.

To add a pilot, copy `config/pilot.saint-lucia.yaml`, change the bbox and local economics,
and run `oceanplastic report --pilot config/pilot.<your-coast>.yaml`.

## 7. MVP vs. full build

The MVP proves the pipeline end-to-end on real data with an honest, labelled drift stub. The
full build (see the table in [`README.md`](../README.md)) adds the OpenDrift backtracking
ensemble, more item-observation feeds, forensic pathway inference, and multi-forum framing.
The architecture does not change — only the fidelity of Axis 2 and the breadth of ingest.
