"""Producer axis (Tier A) — brand -> parent company, from the BFFP aggregates.

Strictly corporate attribution. Carries the mandatory disclosures: the ~51% unbranded
blind spot, that this is count-based not mass-based, and that brand strings are
collaborator-entered and not fully standardized.
"""
from __future__ import annotations

from typing import List

from ..ingest.bffp import BrandAttribution
from ..schema import Share, Tier


def producer_distribution(attr: BrandAttribution, top_n: int = 6) -> List[Share]:
    """Top producers by share of ATTRIBUTABLE (branded) items, plus an explicit
    unbranded entry and an 'other attributable producers' remainder."""
    shares: List[Share] = []
    covered = 0.0
    for name, _items, _share_total, share_attrib in attr.top_parents[:top_n]:
        shares.append(
            Share(
                name=name,
                share=share_attrib,
                tier=Tier.A,
                note="share of branded (attributable) items",
            )
        )
        covered += share_attrib

    remainder = max(1.0 - covered, 0.0)
    if remainder > 0.001:
        shares.append(
            Share(name="Other attributable producers", share=remainder, tier=Tier.A,
                  note="all remaining identified brands")
        )
    return shares


def producer_disclosures(attr: BrandAttribution) -> List[str]:
    return [
        f"~{attr.unbranded_share:.0%} of audited items are UNBRANDED — the producer axis is "
        f"silent on them. Shares above are of the branded remainder only.",
        "Producer attribution is COUNT-BASED, not mass-based; rankings shift with audit "
        "location and ranking rule (volume vs geographic spread).",
        "Brand strings are collaborator-entered and not fully standardized (BFFP data note).",
        f"Producer shares were computed at the '{attr.level}' level. {attr.fallback_note}",
    ]
