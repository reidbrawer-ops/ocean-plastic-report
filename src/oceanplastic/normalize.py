"""Normalize raw records into canonical Observations, enforcing license provenance.

The pipeline's gatekeeper: nothing proceeds without a recorded license. `tag_license`
stamps each record from the source registry; `filter_commercial_safe` drops quarantined
(CC-BY-NC / unresolved) data when building a commercial-output report; `dedupe` collapses
cross-source duplicates.
"""
from __future__ import annotations

from typing import Dict, Iterable, List

from .schema import Observation
from .sources import SourceRegistry


def tag_license(records: Iterable[dict], source_key: str, registry: SourceRegistry) -> List[Observation]:
    """Build Observations from raw dicts, stamping license + commercial_ok from the registry.

    Raises KeyError (via the registry) if the source is not declared — untracked data
    cannot enter the system.
    """
    license_ = registry.license_of(source_key)
    commercial_ok = registry.commercial_ok(source_key)
    out: List[Observation] = []
    for rec in records:
        out.append(
            Observation(
                source=source_key,
                license=license_,
                commercial_ok=commercial_ok,
                timestamp=rec.get("timestamp"),
                lat=rec.get("lat"),
                lon=rec.get("lon"),
                brand=rec.get("brand"),
                parent_company=rec.get("parent_company"),
                item_type=rec.get("item_type"),
                material=rec.get("material"),
                country_found=rec.get("country_found"),
                count=float(rec.get("count", 1) or 1),
            )
        )
    return out


def filter_commercial_safe(observations: Iterable[Observation]) -> List[Observation]:
    """Drop quarantined records (commercial_ok=False) for commercial-output reports."""
    return [o for o in observations if o.commercial_ok]


def dedupe(observations: Iterable[Observation]) -> List[Observation]:
    """Collapse duplicate observations (same place/time/item/brand), summing counts."""
    merged: Dict[tuple, Observation] = {}
    for obs in observations:
        key = obs.dedupe_key()
        if key in merged:
            merged[key].count += obs.count
        else:
            merged[key] = obs.model_copy()
    return list(merged.values())


def license_summary(observations: Iterable[Observation]) -> Dict[str, int]:
    """Count observations per license string (for the report's provenance table)."""
    counts: Dict[str, int] = {}
    for o in observations:
        counts[o.license] = counts.get(o.license, 0) + 1
    return counts
