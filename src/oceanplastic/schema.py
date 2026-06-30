"""Canonical data types for the pipeline.

Two invariants are enforced *at the type level* so the model cannot quietly violate
its own honesty rules:

1. Every `Observation` MUST carry a `license` (see `normalize.tag_license`). Data with
   no recorded license cannot flow through the system.
2. Every monetary / quantitative estimate is a `Band` (low <= central <= high). A point
   estimate is a validation error — the model never reports a single number it cannot
   defend as a range.
"""
from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator


class Tier(str, Enum):
    """Confidence tier attached to every attribution claim."""

    A = "A"  # defensible: producer of a branded item; material type; item sector
    B = "B"  # probabilistic, disclose CIs: source region / pathway from drift+forensics
    C = "C"  # never asserted as fact: emitting country for an item; a deterministic origin

    @property
    def label(self) -> str:
        return {
            "A": "Tier A — defensible",
            "B": "Tier B — probabilistic (disclose uncertainty)",
            "C": "Tier C — not asserted",
        }[self.value]


class Band(BaseModel):
    """A low/central/high range. The model's unit of every quantitative claim."""

    low: float
    central: float
    high: float
    unit: str = ""

    @model_validator(mode="after")
    def _ordered(self) -> "Band":
        if not (self.low <= self.central <= self.high):
            raise ValueError(
                f"Band must satisfy low <= central <= high, got "
                f"({self.low}, {self.central}, {self.high})"
            )
        return self

    def scaled(self, factor: float) -> "Band":
        return Band(
            low=self.low * factor,
            central=self.central * factor,
            high=self.high * factor,
            unit=self.unit,
        )

    def __mul__(self, other: "Band") -> "Band":
        """Multiply two bands (low*low, central*central, high*high)."""
        return Band(
            low=self.low * other.low,
            central=self.central * other.central,
            high=self.high * other.high,
            unit=f"{self.unit}*{other.unit}".strip("*"),
        )


class Observation(BaseModel):
    """One normalized item-level or aggregate record. `license` is required."""

    source: str
    license: str = Field(..., min_length=1)
    commercial_ok: bool = True
    timestamp: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    brand: Optional[str] = None
    parent_company: Optional[str] = None
    item_type: Optional[str] = None  # product / sector (type_product)
    material: Optional[str] = None  # polymer (type_material) — material only, no geo provenance
    country_found: Optional[str] = None  # where collected = consumed-in, NOT manufactured-in
    count: float = 1.0

    def dedupe_key(self) -> tuple:
        rl = lambda v: round(v, 4) if v is not None else None  # noqa: E731
        return (rl(self.lat), rl(self.lon), self.timestamp, self.item_type, self.brand)


class Share(BaseModel):
    """One row of a distribution over sources (producer OR pathway/region axis)."""

    name: str
    share: float  # 0..1
    tier: Tier
    note: str = ""


class ValuationLayer(BaseModel):
    """One layer of the banded monetary estimate."""

    name: str
    band: Band  # USD
    method: str
    role: str  # headline | context | comparator | cross-check
    caveat: str

    @model_validator(mode="after")
    def _not_a_point_estimate(self) -> "ValuationLayer":
        b = self.band
        if b.low == b.central == b.high:
            raise ValueError(f"Valuation layer '{self.name}' is a point estimate; must be a range.")
        return self


class AttributionResult(BaseModel):
    """The two-axis attribution output. The axes are NEVER merged."""

    n_observations: int
    observation_source: str
    producer_axis: List[Share]  # Tier A — corporate, from brand audits
    pathway_axis: List[Share]  # Tier B — emission pathway (land/ship/fisheries)
    region_axis: List[Share]  # Tier B — illustrative source-region prior (drift STUB)
    sector_axis: List[Share]  # Tier A — item typology
    material_axis: List[Share]  # Tier A — polymer (material only)
    unbranded_share: float
    brand_level: str  # "regional" | "global" (which fallback was used)
    consumed_in_countries: List[Share]  # the confound, surfaced explicitly
    notes: List[str] = Field(default_factory=list)
