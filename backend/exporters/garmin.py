"""Shared helpers for Garmin-MapSource-compatible exports (GPX / GDB / DXF).

The reference files produced by surveying offices come from Garmin
MapSource, so all three exporters mirror its conventions:
  * every zone boundary is a closed *track* (not a route / waypoint)
  * GDB is the Garmin MapSource binary database (v2), NOT an Esri FileGDB
  * DXF is 2D AutoCAD R12 in UTM metres, one forced zone for the whole file
"""
import math

from . import zone_shapes, polygons_of

# MGRS latitude bands for the "39 S 263703 3885831" position strings
_BANDS = "CDEFGHJKLMNPQRSTUVWX"


def zone_tracks(zones):
    """Yield (track_name, [(lon, lat), ...closed ring...]) for every polygon.

    MultiPolygon zones become several tracks with a numeric suffix, matching
    how a GPS unit would store separately-walked parcels.
    """
    for z, geom in zone_shapes(zones):
        polys = polygons_of(geom)
        many = len(polys) > 1
        for i, poly in enumerate(polys, 1):
            name = (z.get("name") or f"zone_{z.get('id', i)}").strip()
            if many:
                name = f"{name} {i}"
            pts = [(float(x), float(y)) for x, y in poly.exterior.coords]
            if pts and pts[0] != pts[-1]:
                pts.append(pts[0])
            if len(pts) >= 4:  # 3 distinct points + closing point
                yield name, pts


def utm_zone_of(lon):
    return min(60, max(1, int((lon + 180.0) // 6) + 1))


def band_of(lat):
    idx = min(19, max(0, int((lat + 80.0) // 8)))
    return _BANDS[idx]


def utm_transformer(lon, lat):
    """(zone, band, pyproj Transformer lon/lat -> easting/northing)."""
    from pyproj import Transformer  # heavy import — keep it lazy
    zone = utm_zone_of(lon)
    epsg = (32600 if lat >= 0 else 32700) + zone
    tr = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    return zone, band_of(lat), tr


def true_course(lat1, lon1, lat2, lon2):
    """Initial bearing (degrees clockwise from true north)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))
