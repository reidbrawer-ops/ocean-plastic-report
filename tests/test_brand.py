import csv

from oceanplastic.attribute.brand import producer_distribution
from oceanplastic.ingest.bffp import load_brand_attribution

ROWS = [
    # parent_company_name, type_product, type_material, country, total_count, event_id
    ("the coca-cola company", "food packaging", "pet", "jamaica", 60, "e1"),
    ("pepsico", "food packaging", "pet", "jamaica", 30, "e1"),
    ("unbranded", "", "", "jamaica", 100, "e1"),
    ("other brand", "food packaging", "ldpe", "jamaica", 10, "e2"),
    ("nestlé", "food packaging", "pp", "mexico", 20, "e2"),
    ("the coca-cola company", "food packaging", "pet", "united states of america", 40, "e3"),
]
HEADER = ["parent_company_name", "type_product", "type_material", "country", "total_count", "event_id"]


def _write_csv(tmp_path):
    p = tmp_path / "bffp.csv"
    with open(p, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(HEADER)
        for r in ROWS:
            w.writerow(r)
    return p


def test_unbranded_share_and_top_producer(tmp_path):
    attr = load_brand_attribution(_write_csv(tmp_path))  # global
    assert attr.level == "global"
    # 100 unbranded of 260 total
    assert abs(attr.unbranded_share - (100 / 260)) < 1e-9
    assert attr.top_parents[0][0] == "the coca-cola company"
    # attributable excludes unbranded (100) AND 'other brand' (10) -> 150
    assert abs(attr.attributable_items - 150) < 1e-9


def test_producer_distribution_sums_to_one(tmp_path):
    attr = load_brand_attribution(_write_csv(tmp_path))
    dist = producer_distribution(attr)
    assert abs(sum(s.share for s in dist) - 1.0) < 1e-6
    assert all(s.tier.value == "A" for s in dist)


def test_regional_filter_and_global_fallback(tmp_path):
    csv_path = _write_csv(tmp_path)
    # Region present with enough items -> regional level
    reg = load_brand_attribution(csv_path, region_countries=["jamaica", "mexico"], min_regional_items=50)
    assert reg.level == "regional"
    # Region absent / too few items -> documented global fallback
    fb = load_brand_attribution(csv_path, region_countries=["narnia"], min_regional_items=50)
    assert fb.level == "global"
    assert "fall" in fb.fallback_note.lower() or "global" in fb.fallback_note.lower()
