"""Offline reverse-geocoding of a point to Iran administrative divisions.

Reads boundary polygons from data/iran_divisions.geojson (if present) and finds
which one contains the given lon/lat. The GeoJSON features should each carry
properties: province, county, district, village (any subset).

Drop a full "تقسیمات کشوری" GeoJSON at that path and it works automatically.
A tiny sample file ships with the project so the mechanism is testable.
"""
import json
import os
from functools import lru_cache

from shapely.geometry import shape, Point
from shapely.strtree import STRtree

_GEOJSON_PATH = os.path.join(os.path.dirname(__file__), "data", "iran_divisions.geojson")


@lru_cache(maxsize=1)
def _load_index():
    """Build an R-tree over the division polygons. Cached after first call."""
    if not os.path.exists(_GEOJSON_PATH):
        return None
    try:
        with open(_GEOJSON_PATH, encoding="utf-8") as f:
            gj = json.load(f)
    except Exception:
        return None

    geoms, props = [], []
    for feat in gj.get("features", []):
        try:
            g = shape(feat["geometry"])
            if g.is_empty:
                continue
            geoms.append(g)
            props.append(feat.get("properties", {}))
        except Exception:
            continue
    if not geoms:
        return None
    tree = STRtree(geoms)
    return tree, geoms, props


def reverse_geocode(lon: float, lat: float) -> dict:
    """Return {province, county, district, village} for a point.

    Tries the detailed boundary GeoJSON first (accurate, if the user has dropped
    a full division file in place). Falls back to a province-level bounding-box
    lookup so at least the province is auto-filled anywhere in Iran."""
    empty = {"province": "", "county": "", "district": "", "village": ""}
    idx = _load_index()
    if idx is not None:
        tree, geoms, props = idx
        pt = Point(lon, lat)
        candidates = tree.query(pt)
        for i in candidates:
            i = int(i)
            if geoms[i].contains(pt):
                p = props[i]
                return {
                    "province": p.get("province", "") or p.get("PROVINCE", ""),
                    "county": p.get("county", "") or p.get("COUNTY", ""),
                    "district": p.get("district", "") or p.get("DISTRICT", ""),
                    "village": p.get("village", "") or p.get("VILLAGE", ""),
                }

    # fallback: province-level bounding boxes
    try:
        from data.province_bounds import province_from_point
        prov = province_from_point(lon, lat)
        if prov:
            return {"province": prov, "county": "", "district": "", "village": ""}
    except Exception:
        pass
    return empty
