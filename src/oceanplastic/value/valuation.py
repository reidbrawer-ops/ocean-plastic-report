"""Layered, banded monetary valuation of the attributed plastic.

Headline ask = Layer 1 (local cleanup, defensible) + Layer 2 (tourism/fisheries, case-backed).
Layer 3 (ecosystem-service) is context; Layers 4-5 (lifecycle social cost, plastic-credit
price) are comparators / cross-checks. Every figure is a Band; a point estimate raises.

Mass-based layers use the DOCUMENTED-sample mass (from OpenLitterMap observation count x
illustrative per-item mass). A separately-labelled, clearly-illustrative scaled-coastline
figure is offered when `sample_fraction` is configured.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from ..ingest.bffp import BrandAttribution
from ..ingest.openlittermap import ObservationDensity
from ..schema import Band, ValuationLayer

# Per-unit valuation constants (USD), with citations carried into the report text.
ECOSYSTEM_PER_TONNE = Band(low=3300, central=10440, high=33000, unit="USD/t")  # UNEP/GESAMP
LIFECYCLE_PER_KG = Band(low=19, central=60, high=150, unit="USD/kg")  # WWF/Dalberg
CREDIT_PER_TONNE = Band(low=140, central=335, high=800, unit="USD/t")  # World Bank / Verra range


def _band(values: Tuple[float, float, float], unit: str = "USD") -> Band:
    """Build a valid Band from three values regardless of ordering (robust to config sign)."""
    lo, ce, hi = sorted(values)
    return Band(low=lo, central=ce, high=hi, unit=unit)


def _cfg_band(d: dict, key: str) -> Band:
    v = d[key]
    return _band((float(v["low"]), float(v["central"]), float(v["high"])), unit="")


@dataclass
class Valuation:
    layers: List[ValuationLayer]
    documented_mass_kg: Optional[Band]
    scaled_mass_kg: Optional[Band]
    headline: Optional[Band]
    producer_example: Optional[Tuple[str, float, Band]]  # (name, share_of_total, attributable $)
    notes: List[str] = field(default_factory=list)


def estimate(pilot: dict, density: ObservationDensity, attr: BrandAttribution) -> Valuation:
    p = pilot or {}
    layers: List[ValuationLayer] = []
    notes: List[str] = []

    n = density.n_observations
    mass_g = _cfg_band(p, "avg_item_mass_g")
    cost_kg = _cfg_band(p, "cleanup_cost_usd_per_kg")

    documented_mass_kg: Optional[Band] = None
    scaled_mass_kg: Optional[Band] = None
    headline_central = 0.0
    headline_low = 0.0
    headline_high = 0.0

    if n > 0:
        documented_mass_kg = _band(
            (n * mass_g.low / 1000.0, n * mass_g.central / 1000.0, n * mass_g.high / 1000.0), "kg"
        )

        # Layer 1 — local cleanup cost of the DOCUMENTED sample (headline, most defensible).
        l1 = _band(
            (
                documented_mass_kg.low * cost_kg.low,
                documented_mass_kg.central * cost_kg.central,
                documented_mass_kg.high * cost_kg.high,
            )
        )
        layers.append(ValuationLayer(
            name="Local cleanup cost (documented sample)",
            band=l1, role="headline",
            method=f"{n} documented OpenLitterMap observations x {mass_g.low}-{mass_g.high} g/item "
                   f"x ${cost_kg.low}-{cost_kg.high}/kg cleanup.",
            caveat="Bottom-up local cost; replace the illustrative per-item mass and $/kg with "
                   "measured local figures. Covers the documented sample only.",
        ))
        headline_low += l1.low; headline_central += l1.central; headline_high += l1.high

        # Optional scaled-to-coastline cleanup (context, clearly illustrative).
        if p.get("sample_fraction"):
            frac = p["sample_fraction"]
            scaled_mass_kg = _band((
                documented_mass_kg.low / float(frac["low"]),
                documented_mass_kg.central / float(frac["central"]),
                documented_mass_kg.high / float(frac["high"]),
            ), "kg")
            l1b = _band((
                scaled_mass_kg.low * cost_kg.low,
                scaled_mass_kg.central * cost_kg.central,
                scaled_mass_kg.high * cost_kg.high,
            ))
            layers.append(ValuationLayer(
                name="Cleanup cost scaled to coastline (ILLUSTRATIVE)",
                band=l1b, role="context",
                method=f"Documented sample / sample_fraction ({frac['high']}-{frac['low']}).",
                caveat="Depends entirely on the assumed sampling fraction — illustrative, NOT a "
                       "headline figure. A defensible report measures coastline density directly.",
            ))

        # Layer 3 — ecosystem-service natural-capital range (context).
        mt = documented_mass_kg.scaled(1 / 1000.0)
        layers.append(ValuationLayer(
            name="Ecosystem-service / natural-capital value",
            band=_band((mt.low * ECOSYSTEM_PER_TONNE.low, mt.central * ECOSYSTEM_PER_TONNE.central,
                        mt.high * ECOSYSTEM_PER_TONNE.high)),
            role="context",
            method="Documented mass x UNEP/GESAMP $3,300-33,000 per tonne reduced marine natural capital.",
            caveat="Willingness-to-avoid valuation (2011-era), not an auditable invoice. Context anchor.",
        ))

        # Layer 4 — full-lifecycle social cost (comparator only).
        layers.append(ValuationLayer(
            name="Full-lifecycle social cost",
            band=_band((documented_mass_kg.low * LIFECYCLE_PER_KG.low,
                        documented_mass_kg.central * LIFECYCLE_PER_KG.central,
                        documented_mass_kg.high * LIFECYCLE_PER_KG.high)),
            role="comparator",
            method="Documented mass x WWF/Dalberg $19-150 per kg lifecycle social cost.",
            caveat="Bundles GHG + health + waste externalities across the WHOLE lifecycle; overstates "
                   "what is attributable to this coastline. Comparator only.",
        ))

        # Layer 5 — plastic-credit price cross-check.
        layers.append(ValuationLayer(
            name="Plastic-credit price (cross-check)",
            band=_band((mt.low * CREDIT_PER_TONNE.low, mt.central * CREDIT_PER_TONNE.central,
                        mt.high * CREDIT_PER_TONNE.high)),
            role="cross-check",
            method="Documented mass x World Bank/Verra $140-800 per tonne plastic-credit range.",
            caveat="Credits are contested (GAIA/BFFP greenwashing findings: additionality failures, "
                   "incineration). Never the core ask; require registry-listed + audited + retired provenance.",
        ))
    else:
        notes.append(
            "No local OpenLitterMap observations -> mass-based layers (cleanup, ecosystem, lifecycle, "
            "credit) are not computed rather than fabricated. Only tourism exposure is shown."
        )

    # Layer 2 — tourism/fisheries exposure (mass-independent; headline).
    if p.get("annual_tourism_revenue_usd") and p.get("tourism_deterrence_pct"):
        rev = float(p["annual_tourism_revenue_usd"])
        det = _cfg_band(p, "tourism_deterrence_pct")
        l2 = _band((rev * det.low, rev * det.central, rev * det.high))
        layers.append(ValuationLayer(
            name="Tourism / fisheries revenue at risk",
            band=l2, role="headline",
            method=f"${rev:,.0f} annual tourism receipts x {det.low:.1%}-{det.high:.1%} debris deterrence.",
            caveat="Case-backed (e.g. Cape Town, Zanzibar); deterrence % is illustrative — calibrate locally.",
        ))
        headline_low += l2.low; headline_central += l2.central; headline_high += l2.high

    headline = _band((headline_low, headline_central, headline_high)) if headline_central > 0 else None

    # Producer-attributable example (scales the headline by the #1 producer's share of ALL items).
    producer_example: Optional[Tuple[str, float, Band]] = None
    if headline and attr.top_parents:
        name, _items, share_total, _share_attrib = attr.top_parents[0]
        producer_example = (name, share_total, headline.scaled(share_total))

    return Valuation(
        layers=layers,
        documented_mass_kg=documented_mass_kg,
        scaled_mass_kg=scaled_mass_kg,
        headline=headline,
        producer_example=producer_example,
        notes=notes,
    )
