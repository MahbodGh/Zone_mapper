"""Export helpers: every function takes a list of zone dicts and returns
(bytes, filename, mimetype). A zone dict looks like:
{"id": 1, "name": "...", "region": "...", "owner": "...",
 "color": "#rrggbb", "geometry": {GeoJSON Polygon/MultiPolygon}}
All zones are merged into a single output file.
"""
from shapely.geometry import shape


def zone_shapes(zones):
    """Yield (zone, shapely_geometry) pairs, skipping invalid geometries."""
    for z in zones:
        try:
            geom = shape(z["geometry"])
            if geom.is_empty:
                continue
            yield z, geom
        except Exception:
            continue


def polygons_of(geom):
    """Return a list of shapely Polygons from a Polygon/MultiPolygon."""
    if geom.geom_type == "Polygon":
        return [geom]
    if geom.geom_type == "MultiPolygon":
        return list(geom.geoms)
    return []


def hex_to_rgb(color):
    color = (color or "#2e7d32").lstrip("#")
    if len(color) != 6:
        color = "2e7d32"
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


# ---- shared field helpers (agricultural schema) ----
CULT_FA = {"irrigated": "آبی", "rainfed": "دیم", "": "-"}


def zone_area_ha(z):
    a = z.get("area_m2") or 0
    return a / 10_000.0


def zone_desc_lines(z):
    """Human-readable attribute lines shared by KML/GPX/PDF descriptions."""
    cult = CULT_FA.get(z.get("cultivation") or "", z.get("cultivation") or "-")
    ha = zone_area_ha(z)
    return [
        ("زمین", z.get("name") or "-"),
        ("استان", z.get("province") or "-"),
        ("شهرستان", z.get("county") or "-"),
        ("دهستان", z.get("district") or "-"),
        ("روستا", z.get("village") or "-"),
        ("مالک", z.get("owner_name") or "-"),
        ("نام پدر", z.get("father_name") or "-"),
        ("نوع کشت", cult),
        ("محصول", z.get("crop") or "-"),
        ("مساحت", f"{ha:.4f} هکتار ({(z.get('area_m2') or 0):.0f} م.م.)"),
    ]
