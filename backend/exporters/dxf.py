import io
import re

import ezdxf
from ezdxf.enums import TextEntityAlignment

from . import zone_shapes, polygons_of, hex_to_rgb, zone_area_ha


def _layer_name(name, idx):
    clean = re.sub(r'[<>/\\":;?*|=`]', "_", (name or "").strip()) or f"ZONE_{idx}"
    return clean[:60]


def export_dxf(zones):
    """One DXF, one layer per zone. Coordinates are WGS84 lon/lat degrees."""
    doc = ezdxf.new("R2010", setup=True)
    msp = doc.modelspace()

    for i, (z, geom) in enumerate(zone_shapes(zones), start=1):
        layer = _layer_name(z["name"], i)
        if layer not in doc.layers:
            doc.layers.add(layer)
        rgb = hex_to_rgb(z.get("color"))

        for poly in polygons_of(geom):
            rings = [poly.exterior] + list(poly.interiors)
            for ring in rings:
                pts = [(x, y) for x, y in ring.coords]
                pl = msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": layer})
                pl.rgb = rgb

        c = geom.centroid
        label = f"{z['name']} | {z.get('owner_name') or '-'} | {z.get('crop') or '-'} | {zone_area_ha(z):.3f}ha"
        txt = msp.add_text(
            label,
            dxfattribs={"layer": layer, "height": 0.0004},
        )
        txt.set_placement((c.x, c.y), align=TextEntityAlignment.MIDDLE_CENTER)

    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8"), "zones.dxf", "application/dxf"
