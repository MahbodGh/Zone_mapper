import io
import os
import tempfile

import simplekml

from . import zone_shapes, polygons_of, hex_to_rgb, zone_desc_lines


def _build_kml(zones):
    kml = simplekml.Kml(name="Zones")
    for z, geom in zone_shapes(zones):
        r, g, b = hex_to_rgb(z.get("color"))
        # simplekml colors are aabbggrr
        line = simplekml.Color.rgb(r, g, b)
        fill = simplekml.Color.changealphaint(120, line)
        desc = "<br/>".join(f"{k}: {v}" for k, v in zone_desc_lines(z))
        for poly in polygons_of(geom):
            p = kml.newpolygon(name=z["name"], description=desc)
            p.outerboundaryis = [(x, y) for x, y in poly.exterior.coords]
            for ring in poly.interiors:
                p.innerboundaryis = [(x, y) for x, y in ring.coords]
            p.style.linestyle.color = line
            p.style.linestyle.width = 2
            p.style.polystyle.color = fill
    return kml


def export_kml(zones):
    kml = _build_kml(zones)
    data = kml.kml().encode("utf-8")
    return data, "zones.kml", "application/vnd.google-earth.kml+xml"


def export_kmz(zones):
    kml = _build_kml(zones)
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "zones.kmz")
        kml.savekmz(path)
        with open(path, "rb") as f:
            data = f.read()
    return data, "zones.kmz", "application/vnd.google-earth.kmz"
