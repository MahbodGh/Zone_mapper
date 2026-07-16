"""DXF exporter — Garmin MapSource "2D DXF graphics" style (AutoCAD R12).

Surveying offices expect the DXF that MapSource produces, which differs
completely from a generic GIS DXF:

  * AutoCAD R12 (AC1009), 2D only
  * coordinates are UTM metres (WGS84), the whole file forced into ONE
    UTM zone (the zone of the data), so distances/areas measure correctly
    in AutoCAD
  * 999 header comments documenting datum / grid / zone / extents
  * layers  Waypoints / WptAttribs / Routes / RteAttribs / Tracks / TrkAttribs
  * each zone boundary: a closed POLYLINE on layer "Tracks" plus attributed
    INSERTs (TRACK once, TRACKPOINT per vertex) carrying name, position
    strings like "39 S 263703 3885831", leg length and true course

Text is written as UTF-8 so Persian zone names survive (MapSource itself
mangles them to "?????").
"""
import math

from .garmin import zone_tracks, utm_transformer, true_course, haversine_m


def _g(code, value):
    """One DXF group: right-aligned code, then the value line."""
    return f"{code:>3}\n{value}\n"


# ---------------------------------------------------------------- tables
_LAYERS = [
    ("Waypoints", 7), ("WptAttribs", 7),
    ("Routes", 5), ("RteAttribs", 5),
    ("Tracks", 3), ("TrkAttribs", 3),
]

_BLOCK_TAGS = {
    "WAYPOINT": ["Visible", "Name", "Description", "Type", "Position",
                 "Altitude", "Depth", "Proximity", "Temperature", "Symbol",
                 "DisplayMode", "Color", "Facility", "City", "Country",
                 "Date Modified", "Link", "Categories"],
    "ROUTE": ["Visible", "Name", "Length", "Course", "Waypoints", "Link"],
    "ROUTEPOINT": ["RouteName", "Name", "Position", "Altitude", "Distance",
                   "LegLength", "LegCourse"],
    "TRACK": ["Visible", "Name", "Points", "StartTime", "ElapsedTime",
              "Length", "AvgSpeed", "Link"],
    "TRACKPOINT": ["TrackName", "Position", "Time", "Altitude", "Depth",
                   "LegLength", "LegTime", "LegSpeed", "LegCourse"],
}
_BLOCK_LAYER = {"WAYPOINT": "WptAttribs", "ROUTE": "RteAttribs",
                "ROUTEPOINT": "RteAttribs", "TRACK": "TrkAttribs",
                "TRACKPOINT": "TrkAttribs"}


def _blocks_section():
    s = [_g(0, "SECTION"), _g(2, "BLOCKS")]
    for bname, tags in _BLOCK_TAGS.items():
        layer = _BLOCK_LAYER[bname]
        s += [_g(0, "BLOCK"), _g(8, layer), _g(70, 0),
              _g(2, bname), _g(3, bname),
              _g(10, "0.00000000"), _g(20, "0.00000000")]
        # MapSource draws a little flag glyph inside the WAYPOINT block
        if bname == "WAYPOINT":
            for (x1, y1, x2, y2) in [(0, 0, 0.6, 1.5),
                                     (0.6, 1.5, 1.5, 0.9375),
                                     (1.5, 0.9375, 0.3, 0.75)]:
                s += [_g(0, "LINE"), _g(8, layer),
                      _g(10, f"{x1:.8f}"), _g(20, f"{y1:.8f}"),
                      _g(11, f"{x2:.8f}"), _g(21, f"{y2:.8f}")]
        for i, tag in enumerate(tags):
            s += [_g(0, "ATTDEF"), _g(8, layer),
                  _g(70, 0 if i == 0 else 1), _g(1, ""),
                  _g(2, tag), _g(3, tag),
                  _g(10, "0.30000000"), _g(20, "-0.50000000"),
                  _g(40, "1.00000000")]
        s.append(_g(0, "ENDBLK"))
    s.append(_g(0, "ENDSEC"))
    return "".join(s)


def _attrib(layer, tag, value, x, y, visible=False):
    return "".join([
        _g(0, "ATTRIB"), _g(8, layer), _g(70, 0 if visible else 1),
        _g(1, value), _g(2, tag),
        _g(10, f"{x:.8f}"), _g(20, f"{y:.8f}"), _g(40, "1.00000000"),
    ])


def _insert(block, x, y):
    return "".join([
        _g(0, "INSERT"), _g(8, "TrkAttribs"), _g(2, block),
        _g(41, 1), _g(42, 1), _g(43, 1), _g(50, 0),
        _g(10, f"{x:.8f}"), _g(20, f"{y:.8f}"), _g(66, 1),
    ])


# ---------------------------------------------------------------- main
def export_dxf(zones):
    tracks = list(zone_tracks(zones))  # [(name, [(lon, lat), ...])]

    if tracks:
        all_pts = [p for _, pts in tracks for p in pts]
        c_lon = sum(p[0] for p in all_pts) / len(all_pts)
        c_lat = sum(p[1] for p in all_pts) / len(all_pts)
    else:
        c_lon, c_lat = 51.0, 35.0  # harmless default (empty selection)

    zone, band, tr = utm_transformer(c_lon, c_lat)

    # project every track into the single forced UTM zone
    utm_tracks = []  # (name, [(lon, lat, e, n), ...])
    for name, pts in tracks:
        prj = []
        for lon, lat in pts:
            e, n = tr.transform(lon, lat)
            prj.append((lon, lat, e, n))
        utm_tracks.append((name, prj))

    if utm_tracks:
        es = [e for _, prj in utm_tracks for _, _, e, _ in prj]
        ns = [n for _, prj in utm_tracks for _, _, _, n in prj]
        min_e, max_e = math.floor(min(es)), math.ceil(max(es))
        min_n, max_n = math.floor(min(ns)), math.ceil(max(ns))
    else:
        min_e = max_e = min_n = max_n = 0

    out = []

    # ---- HEADER ----
    out += [_g(0, "SECTION"), _g(2, "HEADER"),
            _g(9, "$ACADVER"), _g(1, "AC1009"),
            _g(9, "$LUNITS"), _g(70, 2),
            _g(999, "Datum:  WGS 84"),
            _g(999, "Grid:  UTM"),
            _g(999, "XY Scale (UTM to drawing units):  1.00000000"),
            _g(999, f"Regardless of their actual UTM zone, "
                    f"DXF XY coordinates use zone {zone}"),
            _g(999, "Proximity Circles (km to drawing units) 1.00000000"),
            _g(999, "Text Height (drawing units):  1.00000000"),
            _g(999, f"Extents:  southwest corner:  {zone} {band} {min_e} {min_n}"),
            _g(999, f"Extents:  northeast corner:  {zone} {band} {max_e} {max_n}"),
            _g(999, "2D DXF graphics"),
            _g(9, "$LIMMIN"), _g(10, f"{min_e:.8f}"), _g(20, f"{min_n:.8f}"),
            _g(9, "$LIMMAX"), _g(10, f"{max_e:.8f}"), _g(20, f"{max_n:.8f}"),
            _g(9, "$EXTMIN"), _g(10, f"{min_e:.8f}"), _g(20, f"{min_n:.8f}"),
            _g(9, "$EXTMAX"), _g(10, f"{max_e:.8f}"), _g(20, f"{max_n:.8f}"),
            _g(0, "ENDSEC")]

    # ---- TABLES (layers) ----
    out += [_g(0, "SECTION"), _g(2, "TABLES"),
            _g(0, "TABLE"), _g(2, "LAYER"), _g(70, len(_LAYERS))]
    for lname, color in _LAYERS:
        out += [_g(0, "LAYER"), _g(2, lname), _g(6, "CONTINUOUS"),
                _g(70, 0), _g(62, color)]
    out += [_g(0, "ENDTAB"), _g(0, "ENDSEC")]

    # ---- BLOCKS ----
    out.append(_blocks_section())

    # ---- ENTITIES ----
    out += [_g(0, "SECTION"), _g(2, "ENTITIES")]

    for name, prj in utm_tracks:
        first_lon, first_lat, first_e, first_n = prj[0]

        # length of the closed boundary
        length = sum(
            haversine_m(prj[i - 1][1], prj[i - 1][0], prj[i][1], prj[i][0])
            for i in range(1, len(prj))
        )

        # TRACK insert with summary attributes
        out.append(_insert("TRACK", first_e, first_n))
        ax, ay = first_e + 0.8, first_n - 1.6
        out.append(_attrib("TrkAttribs", "Visible", name, ax, ay, visible=True))
        out.append(_attrib("TrkAttribs", "Name", name, ax, ay))
        out.append(_attrib("TrkAttribs", "Points", str(len(prj)), ax, ay))
        out.append(_attrib("TrkAttribs", "Length", f"{length:.0f} m", ax, ay))
        out.append(_attrib("TrkAttribs", "Link", "", ax, ay))
        out.append(_g(0, "SEQEND"))

        # the boundary itself: closed POLYLINE on layer Tracks
        out += [_g(0, "POLYLINE"), _g(8, "Tracks"), _g(66, 1)]
        for _, _, e, n in prj:
            out += [_g(0, "VERTEX"), _g(8, "Tracks"),
                    _g(10, f"{e:.2f}"), _g(20, f"{n:.2f}")]
        out.append(_g(0, "SEQEND"))

        # a TRACKPOINT insert per vertex with position / leg data
        for i, (lon, lat, e, n) in enumerate(prj):
            out.append(_insert("TRACKPOINT", e, n))
            out.append(_attrib("TrkAttribs", "TrackName", name, e, n))
            out.append(_attrib(
                "TrkAttribs", "Position",
                f"{zone} {band} {e:.0f} {n:.0f}", e, n))
            if i > 0:
                plon, plat = prj[i - 1][0], prj[i - 1][1]
                leg = haversine_m(plat, plon, lat, lon)
                crs = true_course(plat, plon, lat, lon)
                out.append(_attrib("TrkAttribs", "LegLength", f"{leg:.0f} m", e, n))
                out.append(_attrib("TrkAttribs", "LegCourse",
                                   f"{crs:.4f}\u00b0 true", e, n))
            out.append(_g(0, "SEQEND"))

    out += [_g(0, "ENDSEC"), _g(0, "EOF")]

    return "".join(out).encode("utf-8"), "zones.dxf", "application/dxf"
