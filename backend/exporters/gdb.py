import os
import shutil
import tempfile

import geopandas as gpd
from shapely.geometry import shape


def export_gdb(zones):
    """Write all zones into one FileGeodatabase layer, then zip the .gdb
    folder (a GDB is a directory, so it is delivered as zones_gdb.zip).

    Requires GDAL >= 3.6 (bundled with recent pyogrio wheels) for
    OpenFileGDB write support.
    """
    records = []
    for z in zones:
        try:
            geom = shape(z["geometry"])
        except Exception:
            continue
        records.append(
            {
                "zone_id": z["id"],
                "name": z["name"],
                "province": z.get("province") or "",
                "county": z.get("county") or "",
                "district": z.get("district") or "",
                "village": z.get("village") or "",
                "owner": z.get("owner_name") or "",
                "father": z.get("father_name") or "",
                "cultiv": z.get("cultivation") or "",
                "crop": z.get("crop") or "",
                "area_m2": z.get("area_m2") or 0.0,
                "area_ha": (z.get("area_m2") or 0.0) / 10000.0,
                "geometry": geom,
            }
        )

    gdf = gpd.GeoDataFrame(records, geometry="geometry", crs="EPSG:4326")

    with tempfile.TemporaryDirectory() as tmp:
        gdb_path = os.path.join(tmp, "zones.gdb")
        gdf.to_file(gdb_path, layer="zones", driver="OpenFileGDB", engine="pyogrio")
        zip_base = os.path.join(tmp, "zones_gdb")
        shutil.make_archive(zip_base, "zip", root_dir=tmp, base_dir="zones.gdb")
        with open(zip_base + ".zip", "rb") as f:
            data = f.read()

    return data, "zones_gdb.zip", "application/zip"
