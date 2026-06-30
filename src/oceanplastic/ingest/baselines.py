"""Country / river emission baselines — modeled 'where plastic enters the ocean'.

These are GLOBAL CONTEXT, not a claim about who polluted the pilot coastline. The drift
region-prior (attribute/drift.py) is what speaks to *this* shoreline; the baselines below
say which countries dominate global mismanaged-plastic emission, presented as ordinal /
relative and bracketed by the Strokal-2023 top-down anchor so the bands stay honest.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

from ..schema import Band

_DATA_CSV = Path(__file__).resolve().parent.parent / "data" / "jambeck_top_emitters.csv"

# Headline global river-emission range (Lebreton et al. 2017), Mt/yr. CC-BY-4.0.
LEBRETON_RIVER_MT_YR = Band(low=1.15, central=1.78, high=2.41, unit="Mt/yr")

# Top-down seawater-constrained discharge (Strokal/Weiss et al. 2023), Mt/yr — the honesty
# anchor: it sits BELOW the bottom-up river models. CC-BY-4.0.
STROKAL_TOPDOWN_MT_YR = Band(low=0.13, central=0.70, high=3.80, unit="Mt/yr")


@dataclass
class CountryEmitter:
    country: str
    iso3: str
    mismanaged_mt_2010: float
    note: str


def load_top_emitters() -> List[CountryEmitter]:
    """Curated Jambeck-2015 / Our-World-in-Data top mismanaged-plastic emitters (2010)."""
    out: List[CountryEmitter] = []
    with _DATA_CSV.open("r", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            out.append(
                CountryEmitter(
                    country=row["country"],
                    iso3=row["iso3"],
                    mismanaged_mt_2010=float(row["mismanaged_plastic_mt_2010"]),
                    note=row["note"],
                )
            )
    return out


def top_emitter_shares(n: int = 10) -> List[Tuple[str, float, float]]:
    """Return [(country, mt, share_of_listed)] for the top n listed emitters."""
    emitters = load_top_emitters()
    total = sum(e.mismanaged_mt_2010 for e in emitters) or 1.0
    ranked = sorted(emitters, key=lambda e: e.mismanaged_mt_2010, reverse=True)[:n]
    return [(e.country, e.mismanaged_mt_2010, e.mismanaged_mt_2010 / total) for e in ranked]
