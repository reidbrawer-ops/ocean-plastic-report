"""Build the open Global Plastics Watch dataset from real sources.

Outputs (all under --out, default web/data/):
  countries.geojson  geometry + per-country metrics (the choropleth source + a download)
  countries.csv      tabular country metrics (download)
  rivers.json        top-N river outlets by plastic emission (hotspot layer + download)
  rivers.csv         tabular river points (download)
  meta.json          manifest: metric definitions, sources/licences, counts, generated date

Sources (all commercial-safe): Our World in Data country metrics (Jambeck 2015 / Meijer 2021),
Lebreton et al. 2017 river emissions (CC-BY-4.0), Natural Earth 110m geometry (public domain).
"""
from __future__ import annotations

import csv
import datetime as _dt
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import requests

OWID = {
    "mis": "mismanaged-plastic-waste",
    "ocean": "share-of-global-plastic-waste-emitted-to-the-ocean",
    "pc": "plastic-waste-per-capita",
}
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"
LEBRETON_URL = "https://ndownloader.figshare.com/files/22442972"  # PlasticRiverInputs.csv

METRICS = {
    "mis": {"label": "Mismanaged plastic waste", "unit": "tonnes/yr", "year": 2019,
            "source": "Our World in Data (Jambeck 2015 / Lebreton 2017)"},
    "ocean": {"label": "Share of global ocean plastic emissions", "unit": "%", "year": 2019,
              "source": "Our World in Data (Meijer et al. 2021)"},
    "pc": {"label": "Plastic waste per capita", "unit": "kg/person/day", "year": 2010,
           "source": "Our World in Data (Jambeck et al. 2015)"},
}
SOURCES = [
    {"name": "Our World in Data — plastic pollution", "url": "https://ourworldindata.org/plastic-pollution",
     "license": "CC-BY-4.0", "role": "country emission metrics"},
    {"name": "Lebreton et al. 2017 — river plastic emissions", "url": "https://doi.org/10.1038/ncomms15611",
     "license": "CC-BY-4.0", "role": "river emission hotspots"},
    {"name": "Natural Earth 110m Admin-0", "url": "https://www.naturalearthdata.com/",
     "license": "Public domain", "role": "country geometry"},
]


@dataclass
class BuildResult:
    out_dir: Path
    n_countries: int
    n_matched: int
    n_rivers: int


def _cache_get(url: str, cache_path: Path, timeout: int = 180) -> Path:
    if cache_path.exists() and cache_path.stat().st_size > 0:
        return cache_path
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    resp = requests.get(url, timeout=timeout, stream=True, headers={"User-Agent": "oceanplastic-watch"})
    resp.raise_for_status()
    with open(cache_path, "wb") as fh:
        for chunk in resp.iter_content(chunk_size=1 << 20):
            fh.write(chunk)
    return cache_path


def _fetch_owid(slug: str, cache: Path, offline: bool) -> Dict[str, float]:
    path = cache / f"owid-{slug}.csv"
    if not (offline or path.exists()):
        _cache_get(f"https://ourworldindata.org/grapher/{slug}.csv?csvType=full", path)
    # Accept the pre-seeded cache names too (e.g. mismanaged-plastic-waste.csv).
    if not path.exists():
        alt = cache / f"{slug}.csv"
        path = alt if alt.exists() else path
    out: Dict[str, tuple] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        valcol = [c for c in reader.fieldnames if c not in ("Entity", "Code", "Year")][0]
        for row in reader:
            code = row.get("Code") or ""
            if not code or code.startswith("OWID_"):
                continue
            try:
                v = float(row[valcol])
                yr = int(row["Year"])
            except (ValueError, TypeError):
                continue
            if code not in out or yr >= out[code][1]:
                out[code] = (v, yr)
    return {k: v[0] for k, v in out.items()}


def _fetch_series(slug: str, cache: Path, offline: bool) -> List[list]:
    """Fetch a global time series (Entity=World) as sorted [[year, value], ...]."""
    path = cache / f"owid-{slug}.csv"
    if not (offline or path.exists()):
        _cache_get(f"https://ourworldindata.org/grapher/{slug}.csv?csvType=full", path)
    if not path.exists():
        alt = cache / f"{slug}.csv"
        path = alt if alt.exists() else path
    rows: List[list] = []
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        valcol = [c for c in reader.fieldnames if c not in ("Entity", "Code", "Year")][0]
        for row in reader:
            try:
                rows.append([int(row["Year"]), round(float(row[valcol]))])
            except (ValueError, TypeError):
                continue
    rows.sort()
    return rows


# OECD Global Plastics Outlook macro-regions (the 9 used in plastic-fate / ocean-accumulation).
# Each country is assigned its region so a regional series can paint a country choropleth.
_MENA = {"DZA", "EGY", "LBY", "MAR", "TUN", "SDN", "SAU", "YEM", "OMN", "ARE", "QAT",
         "BHR", "KWT", "IRQ", "IRN", "ISR", "JOR", "LBN", "SYR", "PSE"}


def _oecd_region(iso: str, continent: str):
    if iso == "USA":
        return "United States"
    if iso == "CHN":
        return "China"
    if iso == "IND":
        return "India"
    if iso == "TUR":
        return "Europe"
    if iso in _MENA:
        return "Middle East & North Africa"
    c = continent or ""
    if c == "Europe":
        return "Europe"
    if c == "Oceania":
        return "Oceania"
    if c == "Africa":
        return "Sub-Saharan Africa"
    if c == "Asia":
        return "Asia (excl. China and India)"
    if c in ("North America", "South America"):
        return "Americas (excl. USA)"
    return None


def _fetch_panel(slug: str, cache: Path, offline: bool, key: str = "Code") -> dict:
    """Fetch a multi-year OWID CSV as {entityKey: {year: value}} (key='Code' for ISO3, 'Entity' for regions)."""
    path = cache / f"owid-{slug}.csv"
    if not (offline or path.exists()):
        _cache_get(f"https://ourworldindata.org/grapher/{slug}.csv?csvType=full", path)
    out: dict = {}
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        valcol = [c for c in reader.fieldnames if c not in ("Entity", "Code", "Year")][0]
        for row in reader:
            k = row.get(key) or ""
            if key == "Code" and (not k or k.startswith("OWID_")):
                continue
            try:
                yr = int(row["Year"]); v = round(float(row[valcol]))
            except (ValueError, TypeError):
                continue
            out.setdefault(k, {})[str(yr)] = v
    return out


def _round(obj):
    if isinstance(obj, list):
        return [_round(x) for x in obj]
    if isinstance(obj, float):
        return round(obj, 2)
    return obj


def _iso_of(props: dict) -> str:
    a = props.get("ISO_A3")
    if a and a != "-99":
        return a
    return props.get("ISO_A3_EH", "-99")


def _load_geometry(cache: Path, offline: bool) -> List[dict]:
    path = cache / "ne_110m_admin_0_countries.geojson"
    if not (offline or path.exists()):
        _cache_get(NE_URL, path)
    geo = json.loads(path.read_text(encoding="utf-8"))
    return geo["features"]


def _load_rivers(cache: Path, top: int, offline: bool) -> List[dict]:
    path = cache / "PlasticRiverInputs.csv"
    if not (offline or path.exists()):
        _cache_get(LEBRETON_URL, path)
    rows: List[dict] = []
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            try:
                mid = float(row["i_mid"])
            except (ValueError, KeyError, TypeError):
                continue
            if mid <= 0:
                continue
            rows.append({
                "lon": round(float(row["X"]), 3), "lat": round(float(row["Y"]), 3),
                "mid": round(mid, 2), "low": round(float(row.get("i_low", 0) or 0), 2),
                "high": round(float(row.get("i_high", 0) or 0), 2),
            })
    rows.sort(key=lambda r: r["mid"], reverse=True)
    return rows[:top]


# Curated identification of the major plastic-emitting river outlets, by mouth bounding box
# (lat_min, lat_max, lon_min, lon_max, name). Sourced from the documented top-emitter rivers
# in Lebreton et al. 2017 / Meijer et al. 2021 + river-mouth geography. Applied only to outlets
# that fall inside a box; everything else is labeled by country only. Specific boxes first.
RIVER_NAMES = [
    (30.5, 32.2, 119.5, 122.2, "Yangtze (Changjiang)"),
    (29.9, 30.9, 120.1, 121.2, "Qiantang"),
    (21.8, 23.6, 112.4, 114.2, "Pearl (Zhujiang)"),
    (21.5, 24.5, 88.5, 91.5, "Ganges–Brahmaputra–Meghna"),
    (-2.0, 1.6, -52.2, -49.0, "Amazon"),
    (8.4, 10.6, 105.4, 107.1, "Mekong"),
    (19.7, 21.3, 105.9, 107.3, "Red River (Hồng)"),
    (15.0, 17.6, 93.9, 96.6, "Irrawaddy (Ayeyarwady)"),
    (14.2, 15.1, 120.4, 121.3, "Pasig / Manila Bay"),
    (4.35, 5.2, 7.85, 8.8, "Cross River"),
    (3.9, 5.2, 5.4, 7.85, "Niger Delta"),
    (10.6, 11.5, -75.3, -74.3, "Magdalena"),
    (24.8, 25.5, 121.1, 121.8, "Tamsui (Danshui)"),
    (-7.95, -7.3, 112.4, 113.3, "Brantas"),
    (-7.25, -6.6, 112.1, 112.9, "Bengawan Solo"),
]


def _point_in_ring(lon: float, lat: float, ring: list) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def _build_country_index(features_src):
    """Precompute [(name, bbox, rings)] for point-in-country tests."""
    idx = []
    for f in features_src:
        name = f["properties"].get("NAME") or f["properties"].get("ADMIN")
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        rings = [r for poly in polys for r in poly]
        xs = [p[0] for r in rings for p in r]
        ys = [p[1] for r in rings for p in r]
        idx.append((name, (min(xs), max(xs), min(ys), max(ys)), rings))
    return idx


def _country_of(lon: float, lat: float, idx) -> tuple:
    """Return (country_name, contained_bool); nearest-bbox-centre fallback if not contained."""
    for name, (mnx, mxx, mny, mxy), rings in idx:
        if mnx - 0.6 <= lon <= mxx + 0.6 and mny - 0.6 <= lat <= mxy + 0.6:
            if any(_point_in_ring(lon, lat, r) for r in rings):
                return name, True
    best, bd = None, 1e18
    for name, (mnx, mxx, mny, mxy), _ in idx:
        d = ((mnx + mxx) / 2 - lon) ** 2 + ((mny + mxy) / 2 - lat) ** 2
        if d < bd:
            bd, best = d, name
    return best, False


def _river_name(lon: float, lat: float):
    for la0, la1, lo0, lo1, nm in RIVER_NAMES:
        if la0 <= lat <= la1 and lo0 <= lon <= lo1:
            return nm
    return None


def build_dataset(out_dir: str | Path, cache: str | Path = ".cache", top_rivers: int = 150,
                  offline: bool = False, generated_date: Optional[str] = None) -> BuildResult:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cache = Path(cache)

    metrics = {k: _fetch_owid(slug, cache, offline) for k, slug in OWID.items()}
    features_src = _load_geometry(cache, offline)
    rivers = _load_rivers(cache, top_rivers, offline)
    production = _fetch_series("global-plastics-production", cache, offline)

    # Annotate each river outlet with its country (computed) and, for documented major
    # outlets, a curated river name. `near: true` marks coastal/offshore points snapped to
    # the nearest country rather than strictly contained.
    _cidx = _build_country_index(features_src)
    for r in rivers:
        cname, contained = _country_of(r["lon"], r["lat"], _cidx)
        r["country"] = cname
        if not contained:
            r["near"] = True
        nm = _river_name(r["lon"], r["lat"])
        if nm:
            r["name"] = nm

    feats = []
    matched = 0
    for f in features_src:
        p = f["properties"]
        iso = _iso_of(p)
        name = p.get("NAME") or p.get("ADMIN")
        if name == "Antarctica":
            continue
        vals = {}
        for k in OWID:
            v = metrics[k].get(iso)
            vals[k] = (round(v, 4) if k != "mis" else round(v)) if v is not None else None
        if vals.get("mis") is not None:
            matched += 1
        feats.append({
            "type": "Feature",
            "properties": {"iso": iso, "name": name, "continent": p.get("CONTINENT"), **vals},
            "geometry": {"type": f["geometry"]["type"], "coordinates": _round(f["geometry"]["coordinates"])},
        })

    countries = {"type": "FeatureCollection", "features": feats}
    (out_dir / "countries.geojson").write_text(json.dumps(countries, separators=(",", ":")), encoding="utf-8")
    (out_dir / "rivers.json").write_text(json.dumps(rivers, separators=(",", ":")), encoding="utf-8")
    (out_dir / "production.json").write_text(json.dumps({
        "label": "Global annual plastic production", "unit": "tonnes",
        "source": "Our World in Data (Geyer et al. 2017; OECD)",
        "years": [production[0][0], production[-1][0]] if production else [],
        "series": production,
    }, separators=(",", ":")), encoding="utf-8")

    # ---- Animated time layers (the only real multi-year data) ----
    # Regional pollution (OECD, 2000-2019): paints a country choropleth via iso->region.
    ocean = _fetch_panel("plastic-waste-accumulated-in-oceans", cache, offline, key="Entity")
    ocean.pop("World", None)
    iso_region = {}
    for f in feats:
        reg = _oecd_region(f["properties"]["iso"], f["properties"].get("continent"))
        if reg:
            iso_region[f["properties"]["iso"]] = reg
    ocean_years = sorted({int(y) for r in ocean.values() for y in r})
    (out_dir / "timeline-regions.json").write_text(json.dumps({
        "label": "Plastic accumulated in oceans", "unit": "tonnes", "resolution": "region",
        "source": "OECD Global Plastics Outlook (via Our World in Data)",
        "years": [ocean_years[0], ocean_years[-1]] if ocean_years else [],
        "regions": ocean, "isoRegion": iso_region,
        "note": "9 OECD macro-regions; every country is shaded by its region's value (approximate country→region assignment).",
    }, separators=(",", ":")), encoding="utf-8")

    # Per-country plastic-waste TRADE (UN Comtrade, 1988-2024): a true per-country time series.
    trade = _fetch_panel("plastic-waste-trade", cache, offline, key="Code")
    trade_years = sorted({int(y) for r in trade.values() for y in r})
    (out_dir / "timeline-trade.json").write_text(json.dumps({
        "label": "Plastic waste exports (trade)", "unit": "tonnes", "resolution": "country",
        "source": "UN Comtrade (via Our World in Data)",
        "years": [trade_years[0], trade_years[-1]] if trade_years else [],
        "byIso": trade,
        "note": "Plastic-waste EXPORTS — the trade dimension, NOT pollution. Shows the global waste trade over time (e.g. China's 2018 import ban).",
    }, separators=(",", ":")), encoding="utf-8")

    # CSV mirrors
    with open(out_dir / "countries.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["iso", "name", "continent", "mismanaged_tonnes", "ocean_share_pct", "per_capita_kg_day"])
        for f in feats:
            pr = f["properties"]
            w.writerow([pr["iso"], pr["name"], pr["continent"], pr["mis"], pr["ocean"], pr["pc"]])
    with open(out_dir / "rivers.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["lon", "lat", "plastic_input_mid_tonnes", "low", "high", "river_name", "country"])
        for r in rivers:
            w.writerow([r["lon"], r["lat"], r["mid"], r["low"], r["high"], r.get("name", ""), r.get("country", "")])

    meta = {
        "generated": generated_date or _dt.date.today().isoformat(),
        "metrics": METRICS,
        "sources": SOURCES,
        "counts": {"countries": len(feats), "countries_with_data": matched, "rivers": len(rivers),
                   "production_years": [production[0][0], production[-1][0]] if production else []},
        "timeline": {"label": "Global annual plastic production", "unit": "tonnes",
                     "source": "Our World in Data (Geyer et al. 2017; OECD)", "file": "production.json"},
        "timeLayers": [
            {"key": "ocean_acc", "label": "Plastic in oceans (over time)", "file": "timeline-regions.json",
             "resolution": "region", "theme": "pollution", "years": [ocean_years[0], ocean_years[-1]] if ocean_years else []},
            {"key": "exports", "label": "Plastic waste exports (trade)", "file": "timeline-trade.json",
             "resolution": "country", "theme": "trade", "years": [trade_years[0], trade_years[-1]] if trade_years else []},
        ],
        "downloads": ["countries.geojson", "countries.csv", "rivers.json", "rivers.csv",
                      "production.json", "timeline-regions.json", "timeline-trade.json"],
        "note": ("Open data (CC-BY). Country metrics are single-year modeled snapshots (mismanaged 2019, "
                 "per-capita 2010, ocean-share 2019) — treat as relative, not exact. The timeline is the "
                 "GLOBAL production series 1950-2019; per-country data is not a time series."),
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")

    return BuildResult(out_dir=out_dir, n_countries=len(feats), n_matched=matched, n_rivers=len(rivers))
