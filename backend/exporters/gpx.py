import gpxpy.gpx

from . import zone_shapes, polygons_of, zone_desc_lines


def export_gpx(zones):
    """GPX has no polygon type, so each zone boundary becomes a closed track
    and the zone centroid becomes a named waypoint."""
    gpx = gpxpy.gpx.GPX()
    gpx.name = "Zones"

    for z, geom in zone_shapes(zones):
        desc = " | ".join(f"{k}: {v}" for k, v in zone_desc_lines(z))

        c = geom.centroid
        wpt = gpxpy.gpx.GPXWaypoint(latitude=c.y, longitude=c.x, name=z["name"])
        wpt.description = desc
        gpx.waypoints.append(wpt)

        track = gpxpy.gpx.GPXTrack(name=z["name"], description=desc)
        for poly in polygons_of(geom):
            seg = gpxpy.gpx.GPXTrackSegment()
            for x, y in poly.exterior.coords:
                seg.points.append(gpxpy.gpx.GPXTrackPoint(latitude=y, longitude=x))
            track.segments.append(seg)
        gpx.tracks.append(track)

    return gpx.to_xml().encode("utf-8"), "zones.gpx", "application/gpx+xml"
