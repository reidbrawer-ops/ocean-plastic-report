# Data Sources

Cited inventory of the real, pullable data the model uses (and the context sources it
quarantines). Verified during the research pass; license column drives `config/sources.yaml`.

## Roles

- **Item observations** — what actually washed up (counts, brands, types).
- **Producer attribution** — branded items → parent companies.
- **Emission baselines** — modeled "where plastic enters the ocean" (rivers / countries).
- **Drift / currents** — to backtrack a beached sample to source regions (full build).
- **Context only (quarantined)** — CC-BY-NC or unresolved-terms sources.

## A. Item-level observations

| Source | Access | License | Commercial | Notes |
|---|---|---|:--:|---|
| **OpenLitterMap** — [api docs](https://github.com/OpenLitterMap/openlittermap-web/blob/master/readme/API.md) | Public no-auth GeoJSON API (`/api/clusters`, `/api/points`) | ODbL-1.0 | ✅ (attribution + **share-alike**) | 500k+ obs, 110+ countries. **`bbox` must be a repeated array param** (`bbox[]=left&bbox[]=bottom&…`); zoom 0–16. `/api/download` needs auth; `/timeseries` & `/categories` do **not** exist. Used as the local observation-density signal. |
| **NOAA MDMAP** — [swagger](https://mdmap.orr.noaa.gov/api/spec/) | API + portal export, no login | CC0 (sites) | ✅ | US-shoreline standardized surveys. Spec endpoint can return 5xx intermittently — code against an archived spec. (full build) |
| **EEA Marine LitterWatch** — [datahub](https://www.eea.europa.eu/data-and-maps/data/marine-litter/marine-litterwatch-data) | ESRI REST + WMS + download | EEA open (verify CC) | ✅ (verify) | European beach litter 2010–2021. (full build) |
| **NCEI Marine Microplastics** — [portal](https://www.ncei.noaa.gov/products/microplastics) | Manual export (ArcGIS REST behind) | US-gov open | ✅ | Closest to in-water data; concentrations **not comparable across studies** — presence, not quantity. (full build) |
| **Ocean Conservancy TIDES** — [portal](https://www.coastalcleanupdata.org/) | Manual Excel; no API | **Unresolved** redistribution terms | ⚠️ **quarantined** | World's largest volunteer trash dataset (~1985–present). Resolve terms before relying on it. |
| **Litterati** — [open data](https://www.litterati.org/open-data) | Manual download; no public API | Open | ✅ | 12-month rolling window, 50k-row cap → unusable for historical/automated ingest. |

## B. Producer attribution

| Source | Access | License | Commercial | Notes |
|---|---|---|:--:|---|
| **Break Free From Plastic / Cowger et al. 2024** — [Zenodo 10.5281/zenodo.8428296](https://doi.org/10.5281/zenodo.8428296) | Zenodo REST + `.zip` | **CC-BY-4.0** | ✅ | Concept DOI resolves to version **10849603** (`wincowgerDEV/BFFP-FinalPub.zip`, ~17 MB). 1.87M items, 84 countries, 2018–2022. **~51% unbranded.** Count-based, not mass-based. The backbone of Axis 1; `raw_processed_data.csv` is the table the loader streams. |

## C. Country / river emission baselines

| Source | Access | License | Commercial | Notes |
|---|---|---|:--:|---|
| **Lebreton et al. 2017** — [figshare 4725541](https://figshare.com/articles/dataset/River_plastic_emissions_to_the_world_s_oceans/4725541) | Static GIS + GEE | **CC-BY-4.0** | ✅ | 1.15–2.41 Mt/yr, 40,760 catchments. **Commercial-safe** — preferred base river layer. |
| **Jambeck et al. 2015** — via [Our World in Data](https://ourworldindata.org/ocean-plastics) | Table (OWID re-tabulation) | CC-BY-4.0 (OWID) | ✅ | Country mismanaged-waste, 2010 base year. Use as ordinal/relative. Shipped curated as `src/oceanplastic/data/jambeck_top_emitters.csv`. |
| **Strokal/Weiss et al. 2023** — [Nature Comms](https://www.nature.com/articles/s41467-023-37108-5) | Open-access paper | CC-BY-4.0 | ✅ | Top-down seawater constraint **~0.7 Mt/yr (CI 0.13–3.8)**, *below* the bottom-up models. The uncertainty/honesty anchor. |
| **Meijer et al. 2021 (figshare)** — [figshare 14515590](https://figshare.com/articles/dataset/Supplementary_data_for_More_than_1000_rivers_account_for_80_of_global_riverine_plsatic_emissions_into_the_ocean_/14515590) | Static GIS + GEE | **CC-BY-4.0** (figshare canonical) | ✅ | Higher-resolution successor to Lebreton. **Use the figshare copy** — the CC-BY-NC-ND framing is only on theoceancleanup.com/sources (quarantined below). (full build) |

## D. Drift / current data (full build)

All free, API-grade, used to drive a Lagrangian backtracking ensemble:

| Source | Access | Role |
|---|---|---|
| **Copernicus SMOC** ([product](https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/description)) | `copernicusmarine` toolbox (free reg.) | Preferred field: NEMO currents + FES2014 tides + MFWAM Stokes drift, hourly — purpose-built for floating objects. |
| **ERA5 winds** ([CDS](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels)) | `cdsapi` | 10 m winds for windage/leeway (~3% of wind speed). |
| **HYCOM GOFS 3.1** ([dataserver](https://www.hycom.org/dataserver/gofs-3pt1/reanalysis)) | OPeNDAP/THREDDS | Public-domain 1/12° currents alternative. |
| **OpenDrift** ([opendrift.github.io](https://opendrift.github.io/)) / **OceanParcels** ([oceanparcels.org](https://oceanparcels.org/)) | pip/conda | Lagrangian engines. OpenDrift ships the USCG **Leeway** model + native backward seeding. |
| **plasticadrift.org** ([tool](http://plasticadrift.org/)) | Web + open matrix | Coarse forward/backward statistical prior. Known coastal/polar/Mediterranean gaps. |

> ⚠️ Avoid OSCAR as the drift driver — geostrophic-only; it under-represents the ageostrophic
> + Stokes surface motion that actually moves floating plastic.

## E. Quarantined — context only (CC-BY-NC / unresolved)

| Source | License | Why quarantined |
|---|---|---|
| **Minderoo Global Plastic Watch** — [methodology](https://globalplasticwatch.org/methodology) | CC-BY-NC-2.0 | Non-commercial; satellite land-aggregation sites; API behind a registration form. |
| **Meijer 2021 via theoceancleanup.com/sources** | CC-BY-NC-ND-3.0 | The site framing is NC-ND. Use the **figshare CC-BY** copy instead. |
| **Ocean Conservancy TIDES** | Unresolved | Redistribution terms unresolved for an automated/commercial app. |

## License posture

The model tracks **license per record** and defaults to commercial-safe sources, so either a
non-commercial advocacy deployment or a commercial product stays possible. The `--commercial`
flag excludes every `commercial_ok: false` source. Resolve all licenses before deploying.
