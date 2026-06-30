import pytest
from pydantic import ValidationError

from oceanplastic.normalize import dedupe, filter_commercial_safe, tag_license
from oceanplastic.schema import Observation
from oceanplastic.sources import SourceRegistry

REGISTRY = SourceRegistry({
    "openlittermap": {"name": "OpenLitterMap", "license": "ODbL-1.0", "commercial_ok": True, "role": "obs"},
    "minderoo_gpw": {"name": "GPW", "license": "CC-BY-NC-2.0", "commercial_ok": False, "role": "ctx"},
})


def test_observation_requires_license():
    with pytest.raises(ValidationError):
        Observation(source="x", license="")  # empty license is rejected
    ok = Observation(source="x", license="ODbL-1.0")
    assert ok.license == "ODbL-1.0"


def test_tag_license_stamps_from_registry():
    obs = tag_license([{"lat": 13.9, "lon": -60.9, "count": 2}], "openlittermap", REGISTRY)
    assert obs[0].license == "ODbL-1.0"
    assert obs[0].commercial_ok is True


def test_unknown_source_is_rejected():
    with pytest.raises(KeyError):
        tag_license([{"count": 1}], "not_a_source", REGISTRY)


def test_commercial_filter_drops_quarantined():
    recs = tag_license([{"count": 1}], "openlittermap", REGISTRY) + tag_license(
        [{"count": 1}], "minderoo_gpw", REGISTRY
    )
    safe = filter_commercial_safe(recs)
    assert len(recs) == 2 and len(safe) == 1
    assert safe[0].license == "ODbL-1.0"


def test_dedupe_sums_counts():
    a = Observation(source="s", license="L", lat=13.9, lon=-60.9, item_type="bottle", brand="coke", count=1)
    b = Observation(source="s", license="L", lat=13.9, lon=-60.9, item_type="bottle", brand="coke", count=3)
    c = Observation(source="s", license="L", lat=14.0, lon=-60.8, item_type="cap", count=1)
    merged = dedupe([a, b, c])
    assert len(merged) == 2
    bottle = next(o for o in merged if o.item_type == "bottle")
    assert bottle.count == 4
