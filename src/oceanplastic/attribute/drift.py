"""Drift / source-region channel (Tier B) — **STUB**.

This is NOT a calibrated oceanographic backtracking ensemble. It returns:
  * a pathway prior (coastal-land / riverine / fisheries-ship) seeded from the Meijer-van
    Sebille 2021 GRL backtracking study (~50 / 10 / 40), nudged by the observed maritime
    item fraction; and
  * an illustrative source-region prior taken from the pilot config.

The full build replaces this with an OpenDrift / OceanParcels ensemble driven by Copernicus
SMOC currents + ERA5 winds, solving the (ill-posed, diffusion-amplifying) backward problem
as an adjoint/Kolmogorov-backward probability field over the unknown floating-time prior.
Every region/pathway claim it emits is labelled Tier B and 'illustrative prior'.
"""
from __future__ import annotations

from typing import List

from ..schema import Share, Tier

# GRL backtracking posterior (Meijer & van Sebille 2021), used as the pathway prior.
BASE_PATHWAY = {"Coastal land leakage": 0.50, "Riverine input": 0.10, "Fisheries / shipping": 0.40}

STUB_DISCLAIMER = (
    "Tier B — ILLUSTRATIVE PRIOR, not a calibrated drift ensemble. Pathway split is the "
    "Meijer & van Sebille (2021) backtracking posterior; the region split is an analyst prior "
    "from the pilot config. Replace with an OpenDrift backtracking ensemble before relying on it."
)


def pathway_distribution(maritime_fraction: float = 0.0) -> List[Share]:
    """Pathway prior, nudged toward fisheries/shipping by the observed maritime item fraction."""
    pathway = dict(BASE_PATHWAY)
    # Blend the base fisheries weight with the observed maritime fraction (capped, gentle).
    if maritime_fraction > 0:
        nudge = min(maritime_fraction, 0.5)
        pathway["Fisheries / shipping"] = 0.5 * pathway["Fisheries / shipping"] + 0.5 * nudge
        # renormalize land+river to fill the rest
        rest = 1.0 - pathway["Fisheries / shipping"]
        lr_total = BASE_PATHWAY["Coastal land leakage"] + BASE_PATHWAY["Riverine input"]
        pathway["Coastal land leakage"] = rest * (BASE_PATHWAY["Coastal land leakage"] / lr_total)
        pathway["Riverine input"] = rest * (BASE_PATHWAY["Riverine input"] / lr_total)
    return [
        Share(name=k, share=v, tier=Tier.B, note="emission pathway (prior)")
        for k, v in pathway.items()
    ]


def region_distribution(pilot: dict) -> List[Share]:
    """Illustrative source-region prior from the pilot config (`drift_region_prior`)."""
    prior = (pilot or {}).get("drift_region_prior") or []
    total = sum(float(p.get("prob", 0)) for p in prior) or 1.0
    return [
        Share(name=p["name"], share=float(p.get("prob", 0)) / total, tier=Tier.B,
              note="illustrative source-region prior (config)")
        for p in prior
    ]
