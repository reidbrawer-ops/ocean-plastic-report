"""Fuse the channels into the two-axis AttributionResult.

The two axes are returned SEPARATELY and never combined:
  * producer_axis  (Tier A) — corporate responsibility, from brand audits
  * pathway_axis + region_axis (Tier B) — emission pathway / source region, from drift+forensics

There is deliberately no function that maps an item to an emitting COUNTRY (Tier C). The
consumed-in country breakdown is attached only as a labelled confound, never as blame.
"""
from __future__ import annotations

from ..ingest.bffp import BrandAttribution
from ..ingest.openlittermap import ObservationDensity
from ..schema import AttributionResult, Share, Tier
from . import brand, drift, forensic


def fuse(density: ObservationDensity, attr: BrandAttribution, pilot: dict) -> AttributionResult:
    maritime = forensic.maritime_fraction(attr)

    consumed = [
        Share(name=name.title(), share=share, tier=Tier.A,
              note="where COLLECTED (consumed-in) — NOT manufactured-in or emitted-from")
        for name, _items, share in attr.consumed_in_countries
    ]

    notes = [
        "The producer axis (Tier A) and the pathway/region axis (Tier B) are independent. "
        "They are never merged into a 'country X owes us' claim.",
        "manufactured-in != consumed-in != emitted-from. The waste-export trade severs these "
        "further. No emitting country is asserted for any item (Tier C).",
    ]
    if not density.ok or density.n_observations == 0:
        notes.append(density.note)

    return AttributionResult(
        n_observations=density.n_observations,
        observation_source=density.source,
        producer_axis=brand.producer_distribution(attr),
        pathway_axis=drift.pathway_distribution(maritime),
        region_axis=drift.region_distribution(pilot),
        sector_axis=forensic.sector_distribution(attr),
        material_axis=forensic.material_distribution(attr),
        unbranded_share=attr.unbranded_share,
        brand_level=attr.level,
        consumed_in_countries=consumed,
        notes=notes,
    )
