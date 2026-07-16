"""GDB exporter — Garmin MapSource binary database, version 2.

This is the format Garmin GPS handhelds / MapSource / BaseCamp exchange
(NOT an Esri FileGDB). Byte layout reverse-engineered from reference files
produced by MapSource 6.14.1 and cross-checked with the GPSBabel gdb spec:

    "MsRcf\\0"
    record 'D'  ->  b"m\\0"                 (format version 2: 'k' + 2)
    record 'A'  ->  b"f\\x02sqa\\0<build date>\\0<build time>\\0"
    bare cstring "MapSource\\0"             (outside any sized record)
    record 'T' per track:
        name  utf-8 cstring
        u8    display flag (1)
        i32   colour (0 = default)
        i32   point count
        per point: i32 lat, i32 lon (semicircles: deg * 2^31 / 180),
                   4 x u8 zero flags (no altitude/time/depth/temperature)
        4 x u8 zero trailer
    record 'V'  ->  b"\\0\\x01"             (end of file)

Every record is prefixed with an int32 little-endian payload size followed
by the single record-type byte.
"""
import struct

from .garmin import zone_tracks

_SEMI = 2147483648.0 / 180.0  # degrees -> Garmin semicircles

# Same signature MapSource 6.14.1 writes; kept verbatim for compatibility
_SIGNATURE = b"f\x02sqa\x00Jun 26 2008\x0018:40:52\x00"


def _record(rtype: bytes, payload: bytes) -> bytes:
    return struct.pack("<i", len(payload)) + rtype + payload


def _semicircle(deg: float) -> int:
    v = int(round(deg * _SEMI))
    return max(-2147483648, min(2147483647, v))


def export_gdb(zones):
    out = bytearray(b"MsRcf\x00")
    out += _record(b"D", b"m\x00")
    out += _record(b"A", _SIGNATURE)
    out += b"MapSource\x00"

    for name, pts in zone_tracks(zones):
        p = bytearray()
        p += name.encode("utf-8") + b"\x00"
        p += b"\x01"                       # displayed on the map
        p += struct.pack("<i", 0)          # default colour
        p += struct.pack("<i", len(pts))
        for lon, lat in pts:
            p += struct.pack("<ii", _semicircle(lat), _semicircle(lon))
            p += b"\x00\x00\x00\x00"       # no alt / time / depth / temp
        p += b"\x00\x00\x00\x00"           # trailer (matches MapSource)
        out += _record(b"T", bytes(p))

    out += _record(b"V", b"\x00\x01")
    return bytes(out), "zones.gdb", "application/octet-stream"
