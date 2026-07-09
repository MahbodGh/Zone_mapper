"""Geometry helpers — accurate area from lon/lat GeoJSON."""
from shapely.geometry import shape
from shapely.ops import transform
from pyproj import Geod

_GEOD = Geod(ellps="WGS84")


def polygon_area_m2(geojson_geometry: dict) -> float:
    """Return the geodesic area of a GeoJSON Polygon/MultiPolygon in square
    metres, computed on the WGS84 ellipsoid (correct for any location on Earth,
    unlike a naive planar area on lon/lat degrees)."""
    try:
        geom = shape(geojson_geometry)
    except Exception:
        return 0.0
    if geom.is_empty:
        return 0.0

    total = 0.0
    polys = []
    if geom.geom_type == "Polygon":
        polys = [geom]
    elif geom.geom_type == "MultiPolygon":
        polys = list(geom.geoms)

    for poly in polys:
        lons, lats = poly.exterior.coords.xy
        area, _ = _GEOD.polygon_area_perimeter(list(lons), list(lats))
        total += abs(area)
        for ring in poly.interiors:  # subtract holes
            ilons, ilats = ring.coords.xy
            harea, _ = _GEOD.polygon_area_perimeter(list(ilons), list(ilats))
            total -= abs(harea)
    return round(total, 2)


def format_area(m2: float) -> dict:
    """Convenience: also express area in hectares and jarib (Iranian unit)."""
    return {
        "m2": round(m2, 2),
        "hectare": round(m2 / 10_000, 4),
        "jarib": round(m2 / 1_000, 3),  # 1 jarib ≈ 1000 m² (common local value)
    }
