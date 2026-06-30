"""Forensic / typology channel (Tier A) — item sector and polymer from the BFFP aggregates.

Item typology (sector) is Tier A and feeds the pathway prior (maritime/fishing-gear items
weight the ship/fisheries pathway). Polymer/material is Tier A but carries ZERO geographic
provenance — it is reported as material composition only, never as origin.
"""
from __future__ import annotations

from typing import List

from ..ingest.bffp import BrandAttribution
from ..schema import Share, Tier

# Sector strings that indicate a maritime / fishing-gear source (ship/fisheries pathway).
MARITIME_SECTORS = ("fishing", "aquaculture", "maritime", "vessel", "net", "rope")


def sector_distribution(attr: BrandAttribution, top_n: int = 6) -> List[Share]:
    return [
        Share(name=name, share=share, tier=Tier.A, note="item sector (use)")
        for name, _items, share in attr.sectors[:top_n]
    ]


def material_distribution(attr: BrandAttribution, top_n: int = 6) -> List[Share]:
    return [
        Share(name=name, share=share, tier=Tier.A, note="polymer — material only, no geo provenance")
        for name, _items, share in attr.materials[:top_n]
    ]


def maritime_fraction(attr: BrandAttribution) -> float:
    """Fraction of sector-classified items that look maritime/fishing-gear in origin."""
    total = sum(items for _n, items, _s in attr.sectors) or 1.0
    maritime = sum(
        items for name, items, _s in attr.sectors if any(k in name for k in MARITIME_SECTORS)
    )
    return maritime / total
