# Methodology

How the attribution engine fuses evidence into two axes, and how valuation turns attributed
plastic into a banded monetary claim. Every method below is reported with its tier and its
known failure mode.

## The governing confound

> **manufactured-in ≠ consumed-in ≠ emitted-from.**

A printed label tells you where an item was *made* or *sold*. It does not tell you where it
*entered the ocean*. The global plastic-waste **export trade** (e.g. mislabeled HS-code
shipments, [Greenpeace/Malaysia](https://www.greenpeace.org/international/press-release/43469/waste-trade-woes-plastic-waste-from-developed-countries-add-to-malaysias-environmental-crisis/))
severs consumption from emission even further. The canonical warning is **Inaccessible
Island** ([Ryan et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6800376/)): 73–83% of
bottles were Asian (~59% China), yet date-stamps + drift + barnacle age showed they came from
**ships**, not Chinese land leakage. The model therefore **never** names an emitting country
from item evidence (Tier C).

## Axis 1 — Producer responsibility (Tier A)

**Method.** Stream the BFFP/Cowger table; sum item counts by `parent_company_name`; report the
top producers as a share of the *branded (attributable)* items. Implemented in
`ingest/bffp.py` + `attribute/brand.py`.

**Mandatory disclosures (the axis is invalid without them):**
- **~51% of items are unbranded** → the method is silent on half of *audited litter*. Shares
  are of the branded remainder only.
- **Count-based, not mass-based.** A film and a bottle count equally. Rankings also shift with
  audit *location* and *ranking rule* (volume vs geographic spread can flip Coke/Pepsi).
- **Brand strings are collaborator-entered** and not fully standardized (per the dataset's own
  `data_descriptions.csv`).
- The production↔pollution relationship reported by Cowger et al. 2024 is **correlational**
  (log-log slope ≈ 1, adj R² ≈ 0.4), not causal.

**What it can claim:** the producer of a *branded* item (Tier A). **What it cannot:** that a
company's product reached *this* coastline, or any national blame.

## Axis 2 — Emission pathway & source region (Tier B)

Three sub-channels; in the MVP the drift sub-channel is a labelled **STUB**.

### Forensic / typology (Tier A → feeds pathway)
Item sector (consumer packaging vs fishing gear), and where present date-stamp + manufacture
mark + biofouling (*Lepas* barnacle) age → a **land-vs-ship pathway** signal. Maritime/fishing
sectors weight the fisheries/shipping pathway (`attribute/forensic.py`).
**Polymer/resin ID (RIC/FTIR/LIBS) carries zero geographic provenance** — material type only,
never origin.

### Oceanographic backtracking (Tier B) — STUB in the MVP
**Goal:** a probability **map** of source regions for beached samples. **Method (full build):**
forward-simulation + Bayesian inference and/or backward/adjoint particle tracking driven by
surface currents + Stokes drift + object-class windage/leeway, over an **ensemble of unknown
floating times**.

Two facts make this hard and are stated wherever a region claim appears:
- **Backward tracking with diffusion is ill-posed.** A simple velocity sign-flip only works for
  pure advection; with diffusion the reverse-time problem is amplifying and must be solved as
  the **Kolmogorov-backward / adjoint Fokker–Planck** probability field, especially in
  divergent flow (gyres, coastal Ekman).
- **The dominant uncertainty is unknown floating time** (particle age) — it shifts the
  attributed region dramatically. Trajectory skill degrades at ~5–10 km/day separation, so
  anything beyond a few weeks is statistical.

References: [Meijer & van Sebille 2021 (GRL, backward)](https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2021GL097214)
— the source of the **~50% coastal / 10% riverine / 40% fisheries** pathway prior used in the
stub — and the [South Atlantic forward study (Frontiers)](https://www.frontiersin.org/journals/marine-science/articles/10.3389/fmars.2022.925437/full).

**MVP stub** (`attribute/drift.py`): returns the GRL pathway prior (nudged by the observed
maritime item fraction) and an analyst **source-region prior from the pilot config** — both
labelled *Tier B, illustrative prior, not a calibrated ensemble*.

## Fusion

`attribute/fuse.py` assembles an `AttributionResult` with **separate** `producer_axis` (Tier A),
`pathway_axis` + `region_axis` (Tier B), `sector_axis`/`material_axis` (Tier A), the
`unbranded_share`, and the consumed-in country breakdown attached only as a **labelled
confound**. The conceptual posterior for the full build is:

```
P(source | sample) ∝ P(drift evidence | source) · P(forensic markers | source) · prior(source)
```

with priors from coastal population, river emissions (Lebreton/Meijer), and fishing intensity.
There is **no** fusion path that yields an emitting country (Tier C).

## Valuation (banded)

`value/valuation.py`. Mass-based layers use the documented-sample mass (OpenLitterMap
observation count × an illustrative per-item mass). Every layer is a `Band`; a point estimate
raises.

| Layer | Role | Range basis | Caveat |
|---|---|---|---|
| Local cleanup cost | **headline** | local $/kg, bottom-up | most defensible; documented sample only |
| Cleanup scaled to coastline | context | ÷ sample fraction | depends entirely on the sampling assumption |
| Tourism / fisheries at risk | **headline** | revenue × deterrence % | case-backed (Cape Town 85% deterrence; Zanzibar ~$28M/yr) |
| Ecosystem-service value | context | UNEP/GESAMP $3,300–33,000/t | willingness-to-avoid (2011-era), not an invoice |
| Full-lifecycle social cost | comparator | WWF/Dalberg $19–150/kg | bundles GHG+health across the whole lifecycle; overstates |
| Plastic-credit price | cross-check | World Bank/Verra $140–800/t | contested — [GAIA/BFFP "Smoke & Mirrors"](https://www.breakfreefromplastic.org/2023/11/16/press-release-smoke-and-mirrors/): additionality failures, incineration |

**Headline ask** = the two defensible layers. A **producer-attributable example** scales the
headline by the #1 producer's share of all documented items — an EPR/contribution figure, not
a court award. The [Lebreton 2017](https://www.nature.com/articles/ncomms15611) (1.15–2.41
Mt/yr) and [Strokal 2023](https://www.nature.com/articles/s41467-023-37108-5) (~0.7 Mt/yr)
global ranges are cited together so the bands are visibly not cherry-picked.

## Tiering rule of thumb

| If the claim is… | Tier | Allowed in a report? |
|---|:--:|---|
| "This branded item is a Coca-Cola product" | A | Yes |
| "X% of branded items are PepsiCo" | A | Yes (with the unbranded disclosure) |
| "This coastline's plastic is ~40% local, ~25% North Atlantic" | B | Yes, as a labelled prior with uncertainty |
| "This bottle came from Brazil" | C | **Never** |
| "Country X owes us $Y for our beaches" | C | **Never** |
