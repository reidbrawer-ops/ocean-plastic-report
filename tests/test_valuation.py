import pytest
from pydantic import ValidationError

from oceanplastic.ingest.bffp import BrandAttribution
from oceanplastic.ingest.openlittermap import ObservationDensity
from oceanplastic.schema import Band, ValuationLayer
from oceanplastic.value.valuation import estimate

PILOT = {
    "avg_item_mass_g": {"low": 5, "central": 12, "high": 30},
    "cleanup_cost_usd_per_kg": {"low": 0.5, "central": 1.2, "high": 2.5},
    "sample_fraction": {"low": 0.30, "central": 0.10, "high": 0.02},
    "annual_tourism_revenue_usd": 1_000_000_000,
    "tourism_deterrence_pct": {"low": 0.005, "central": 0.02, "high": 0.05},
}


def _attr():
    return BrandAttribution(
        level="global", total_items=1000, attributable_items=500, unbranded_items=500,
        unbranded_share=0.5,
        top_parents=[("the coca-cola company", 100, 0.10, 0.20)],
        sectors=[("food packaging", 400, 0.4)], materials=[("pet", 300, 0.3)],
        consumed_in_countries=[("jamaica", 600, 0.6)], n_events=3,
    )


def test_point_estimate_is_rejected():
    with pytest.raises(ValidationError):
        ValuationLayer(name="bad", band=Band(low=5, central=5, high=5), method="m", role="headline", caveat="c")


def test_all_layers_are_strict_bands():
    density = ObservationDensity(n_observations=74, n_clusters=2)
    val = estimate(PILOT, density, _attr())
    assert val.layers, "expected valuation layers"
    for layer in val.layers:
        assert layer.band.low < layer.band.central < layer.band.high, f"{layer.name} not a strict band"
    # headline = cleanup(documented) + tourism, both present
    assert val.headline is not None
    roles = {l.role for l in val.layers}
    assert {"headline", "context", "comparator", "cross-check"} <= roles


def test_producer_example_scales_headline():
    density = ObservationDensity(n_observations=74, n_clusters=2)
    val = estimate(PILOT, density, _attr())
    name, share, band = val.producer_example
    assert name == "the coca-cola company"
    assert abs(band.central - val.headline.central * share) < 1e-6


def test_no_observations_skips_mass_layers_but_keeps_tourism():
    density = ObservationDensity(n_observations=0, n_clusters=0, ok=False, note="offline")
    val = estimate(PILOT, density, _attr())
    names = [l.name for l in val.layers]
    assert any("Tourism" in n for n in names)
    assert not any("cleanup" in n.lower() for n in names)
    assert val.documented_mass_kg is None
