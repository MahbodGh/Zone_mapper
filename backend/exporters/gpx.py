"""GPX exporter — Garmin MapSource style.

Mirrors the structure of GPX files produced by MapSource 6.14.x, which is
what surveying offices and Garmin handhelds expect:
  * GPX 1.1 with the Garmin GpxExtensions schema location
  * <metadata> with <time> and a <bounds> element
  * every zone boundary is ONE closed <trk>/<trkseg> (no waypoints,
    no routes, no descriptions cluttering the device screen)
  * 7-decimal lat/lon, self-closing <trkpt> tags
"""
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from .garmin import zone_tracks

_HEADER = (
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
    '<gpx xmlns="http://www.topografix.com/GPX/1/1" creator="Zone Mapper"'
    ' version="1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
    ' xsi:schemaLocation="http://www.garmin.com/xmlschemas/GpxExtensions/v3'
    ' http://www.garmin.com/xmlschemas/GpxExtensionsv3.xsd'
    ' http://www.topografix.com/GPX/1/1'
    ' http://www.topografix.com/GPX/1/1/gpx.xsd">\n'
)


def export_gpx(zones):
    tracks = list(zone_tracks(zones))

    lats = [lat for _, pts in tracks for _, lat in pts]
    lons = [lon for _, pts in tracks for lon, _ in pts]

    out = [_HEADER, "\n  <metadata>\n"]
    out.append('    <link href="https://mapnovix.com">\n'
               "      <text>Zone Mapper</text>\n    </link>\n")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out.append(f"    <time>{now}</time>\n")
    if lats:
        out.append(
            f'    <bounds maxlat="{max(lats):.7f}" maxlon="{max(lons):.7f}"'
            f' minlat="{min(lats):.7f}" minlon="{min(lons):.7f}"/>\n'
        )
    out.append("  </metadata>\n")

    for name, pts in tracks:
        out.append("\n  <trk>\n")
        out.append(f"    <name>{escape(name)}</name>\n")
        out.append(
            "    <extensions>\n"
            '      <gpxx:TrackExtension xmlns:gpxx="http://www.garmin.com/xmlschemas/GpxExtensions/v3">\n'
            "        <gpxx:DisplayColor>White</gpxx:DisplayColor>\n"
            "      </gpxx:TrackExtension>\n"
            "    </extensions>\n"
        )
        out.append("    <trkseg>\n")
        for lon, lat in pts:
            out.append(f'      <trkpt lat="{lat:.7f}" lon="{lon:.7f}"/>\n')
        out.append("    </trkseg>\n  </trk>\n")

    out.append("\n</gpx>\n")
    return "".join(out).encode("utf-8"), "zones.gpx", "application/gpx+xml"
