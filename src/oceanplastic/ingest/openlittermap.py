"""OpenLitterMap connector — local observation density (the 'what washed up here' signal).

The public, no-auth clusters endpoint returns a GeoJSON FeatureCollection of clusters for
a bounding box + zoom (0-16). Summing each cluster's `point_count` gives the number of
documented litter observations in the box. Per-item brand/material is NOT available from
this endpoint (that comes from the BFFP dataset); OpenLitterMap's role is the local,
geotagged observation count for the pilot coastline.

Licence: ODbL-1.0 (attribution + share-alike).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

import requests

API_URL = "https://openlittermap.com/api/clusters"
LICENSE = "ODbL-1.0"


@dataclass
class ObservationDensity:
    n_observations: int
    n_clusters: int
    source: str = "openlittermap"
    license: str = LICENSE
    bbox: Optional[dict] = None
    ok: bool = True
    note: str = ""
    cluster_points: List[dict] = field(default_factory=list)  # [{lat, lon, count}]


def fetch_observation_density(
    bbox: dict,
    zoom: int = 12,
    year: Optional[int] = None,
    timeout: int = 25,
    session: Optional[requests.Session] = None,
) -> ObservationDensity:
    """Query OpenLitterMap clusters for `bbox` and total the documented observations.

    `bbox` = {left, bottom, right, top}. Degrades gracefully: on network error or empty
    result returns n_observations=0 with an explanatory note (a data-sparse coastline is a
    legitimate, honest outcome — not an error to hide).
    """
    sess = session or requests.Session()
    # OpenLitterMap requires bbox as a repeated array param: bbox[]=left&bbox[]=bottom...
    params = [
        ("zoom", zoom),
        ("bbox[]", bbox["left"]),
        ("bbox[]", bbox["bottom"]),
        ("bbox[]", bbox["right"]),
        ("bbox[]", bbox["top"]),
    ]
    if year is not None:
        params.append(("year", year))

    try:
        resp = sess.get(API_URL, params=params, headers={"Accept": "application/json"}, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        return ObservationDensity(
            n_observations=0, n_clusters=0, bbox=bbox, ok=False,
            note=f"OpenLitterMap unreachable or returned non-JSON ({exc}). Reported as 0 observations.",
        )

    features = data.get("features", []) if isinstance(data, dict) else []
    total = 0
    clusters = 0
    points = []
    for feat in features:
        props = feat.get("properties", {}) or {}
        count = int(props.get("point_count", 1) or 1)
        total += count
        clusters += 1
        geom = feat.get("geometry", {}) or {}
        coords = geom.get("coordinates") or [props.get("lon"), props.get("lat")]
        if coords and len(coords) >= 2:
            points.append({"lon": coords[0], "lat": coords[1], "count": count})

    note = "" if total else (
        "No documented OpenLitterMap observations in this bbox — a data-sparse coastline. "
        "The report proceeds on the regional/global BFFP attribution and discloses the gap."
    )
    return ObservationDensity(
        n_observations=total, n_clusters=clusters, bbox=bbox, ok=True, note=note, cluster_points=points,
    )
