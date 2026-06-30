"""Break Free From Plastic brand-audit loader (Cowger et al. 2024) — producer attribution.

Source of truth for the producer-responsibility axis (Tier A). Streams
`raw_processed_data.csv` (one row per brand/item-type within an audit event) and aggregates
item counts by parent company, sector, polymer, and collection country.

KEY HONESTY NOTES encoded here:
  * ~51% of items are 'unbranded' -> the method is silent on half of audited litter.
  * Counts are item COUNTS, not MASS.
  * The `country` field is where litter was COLLECTED (consumed-in), NOT manufactured-in or
    emitted-from. We surface it, labelled, as the governing confound — never as blame.

Licence: CC-BY-4.0 (Zenodo record 10849603).
"""
from __future__ import annotations

import csv
import io
import zipfile
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests

ZENODO_FILE_URL = "https://zenodo.org/api/records/10849603/files/wincowgerDEV/BFFP-FinalPub.zip/content"
CSV_SUFFIX = "raw_processed_data.csv"  # the top-level processed table
LICENSE = "CC-BY-4.0"
SOURCE = "bffp_cowger_2024"

# Parent strings that are NOT a real attributable producer.
UNBRANDED = {"unbranded"}
NON_ATTRIBUTABLE = {"unbranded", "other brand", "", "na", "null"}


@dataclass
class BrandAttribution:
    level: str  # "regional" | "global"
    total_items: float
    attributable_items: float
    unbranded_items: float
    unbranded_share: float
    top_parents: List[Tuple[str, float, float, float]]  # name, items, share_of_total, share_of_attrib
    sectors: List[Tuple[str, float, float]]  # name, items, share
    materials: List[Tuple[str, float, float]]
    consumed_in_countries: List[Tuple[str, float, float]]
    n_events: int
    license: str = LICENSE
    source: str = SOURCE
    region_countries: List[str] = field(default_factory=list)
    fallback_note: str = ""


def ensure_dataset(cache_dir: str | Path, timeout: int = 180) -> Path:
    """Return the path to the extracted raw_processed_data.csv, downloading+extracting if absent."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    out_csv = cache_dir / "bffp_raw_processed_data.csv"
    if out_csv.exists() and out_csv.stat().st_size > 0:
        return out_csv

    zip_path = cache_dir / "BFFP-FinalPub.zip"
    if not (zip_path.exists() and zip_path.stat().st_size > 0):
        resp = requests.get(ZENODO_FILE_URL, timeout=timeout, stream=True)
        resp.raise_for_status()
        with open(zip_path, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                fh.write(chunk)

    with zipfile.ZipFile(zip_path) as zf:
        member = next(
            (n for n in zf.namelist() if n.endswith(CSV_SUFFIX) and "github_data" not in n), None
        )
        if member is None:
            raise FileNotFoundError(f"{CSV_SUFFIX} not found inside the BFFP zip.")
        with zf.open(member) as src, open(out_csv, "wb") as dst:
            dst.write(src.read())
    return out_csv


class _Agg:
    def __init__(self) -> None:
        self.parents: Counter = Counter()
        self.sectors: Counter = Counter()
        self.materials: Counter = Counter()
        self.countries: Counter = Counter()
        self.events: set = set()
        self.total = 0.0
        self.unbranded = 0.0
        self.non_attrib = 0.0

    def add(self, parent: str, sector: str, material: str, country: str, count: float, event: str) -> None:
        self.total += count
        self.events.add(event)
        p = parent.strip().lower()
        if p in UNBRANDED:
            self.unbranded += count
        if p in NON_ATTRIBUTABLE:
            self.non_attrib += count
        else:
            self.parents[parent.strip()] += count
        if sector and sector.strip().lower() not in ("", "null", "na"):
            self.sectors[sector.strip().lower()] += count
        if material and material.strip().lower() not in ("", "null", "na"):
            self.materials[material.strip().lower()] += count
        if country and country.strip().lower() not in ("", "null", "na"):
            self.countries[country.strip().lower()] += count

    @property
    def attributable(self) -> float:
        return max(self.total - self.non_attrib, 0.0)

    def summarize(self, level: str, region_countries: List[str], fallback_note: str) -> "BrandAttribution":
        attrib = self.attributable or 1.0
        total = self.total or 1.0

        def top(counter: Counter, n: int) -> List[Tuple[str, float, float]]:
            return [(name, items, items / total) for name, items in counter.most_common(n)]

        top_parents = [
            (name, items, items / total, items / attrib)
            for name, items in self.parents.most_common(10)
        ]
        return BrandAttribution(
            level=level,
            total_items=self.total,
            attributable_items=self.attributable,
            unbranded_items=self.unbranded,
            unbranded_share=(self.unbranded / total),
            top_parents=top_parents,
            sectors=top(self.sectors, 8),
            materials=top(self.materials, 8),
            consumed_in_countries=top(self.countries, 8),
            n_events=len(self.events),
            region_countries=list(region_countries),
            fallback_note=fallback_note,
        )


def load_brand_attribution(
    csv_path: str | Path,
    region_countries: Optional[List[str]] = None,
    min_regional_items: float = 5000,
) -> BrandAttribution:
    """Aggregate the BFFP table. Tries the regional filter first; falls back to global
    (with a disclosed note) when the region has too few attributable items.
    """
    region = {c.strip().lower() for c in (region_countries or [])}
    glob = _Agg()
    reg = _Agg()

    with open(csv_path, newline="", encoding="utf-8", errors="replace") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            try:
                count = float(row.get("total_count") or 0)
            except ValueError:
                count = 0.0
            if count <= 0:
                continue
            parent = row.get("parent_company_name") or ""
            sector = row.get("type_product") or ""
            material = row.get("type_material") or ""
            country = (row.get("country") or "").strip()
            event = row.get("event_id") or ""
            glob.add(parent, sector, material, country, count, event)
            if region and country.lower() in region:
                reg.add(parent, sector, material, country, count, event)

    if region and reg.attributable >= min_regional_items:
        return reg.summarize(
            "regional",
            sorted(region),
            f"Producer shares computed from {len(reg.events)} brand-audit events in "
            f"{len(reg.countries)} Caribbean-basin countries (Saint Lucia has no BFFP audits).",
        )
    note = (
        "No / too few regional brand audits for this coastline — falling back to GLOBAL "
        "producer shares. Regional shares would be preferable; disclosed here for honesty."
        if region
        else "Global producer shares."
    )
    return glob.summarize("global", sorted(region), note)
