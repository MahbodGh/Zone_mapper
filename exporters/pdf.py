import io

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Patch
import urllib.request
import math

from . import zone_shapes, polygons_of, zone_desc_lines, zone_area_ha, CULT_FA

# Persian/Arabic text needs reshaping + bidi to render correctly in matplotlib.
# Both packages are optional; without them Latin text still works fine.
try:
    import arabic_reshaper
    from bidi.algorithm import get_display

    def fa(text):
        return get_display(arabic_reshaper.reshape(str(text)))
except ImportError:  # pragma: no cover
    def fa(text):
        return str(text)

# Use a font that contains Arabic-script glyphs if one is available.
import os
from matplotlib import font_manager

_FONT_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), "..", "fonts", "Vazirmatn-Regular.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
for _p in _FONT_CANDIDATES:
    if os.path.exists(_p):
        try:
            font_manager.fontManager.addfont(_p)
            plt.rcParams["font.family"] = font_manager.FontProperties(fname=_p).get_name()
            break
        except Exception:
            pass


def _deg2num(lat, lon, z):
    lat_r = math.radians(lat)
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n
    return x, y


def _add_satellite_basemap(ax, bounds, pad=0.25):
    """Draw Esri World Imagery tiles behind the given axis extent.
    Fails silently (leaves a plain background) if offline."""
    minx, miny, maxx, maxy = bounds
    dx = (maxx - minx) or 0.01
    dy = (maxy - miny) or 0.01
    minx -= dx * pad; maxx += dx * pad
    miny -= dy * pad; maxy += dy * pad

    # pick a zoom that yields a handful of tiles
    zoom = 15
    for z in range(17, 8, -1):
        x0, y0 = _deg2num(maxy, minx, z)
        x1, y1 = _deg2num(miny, maxx, z)
        if abs(x1 - x0) <= 6 and abs(y1 - y0) <= 6:
            zoom = z
            break

    x0, y0 = _deg2num(maxy, minx, zoom)
    x1, y1 = _deg2num(miny, maxx, zoom)
    xt0, xt1 = int(min(x0, x1)), int(max(x0, x1))
    yt0, yt1 = int(min(y0, y1)), int(max(y0, y1))

    n = 2 ** zoom
    def num2deg(xt, yt):
        lon = xt / n * 360.0 - 180.0
        lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yt / n))))
        return lat, lon

    import matplotlib.image as mpimg
    got_any = False
    for xt in range(xt0, xt1 + 1):
        for yt in range(yt0, yt1 + 1):
            url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{zoom}/{yt}/{xt}"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "zone-mapper"})
                data = urllib.request.urlopen(req, timeout=6).read()
                img = mpimg.imread(io.BytesIO(data), format="jpeg")
                lat_top, lon_left = num2deg(xt, yt)
                lat_bot, lon_right = num2deg(xt + 1, yt + 1)
                ax.imshow(img, extent=[lon_left, lon_right, lat_bot, lat_top],
                          origin="upper", zorder=0, interpolation="bilinear")
                got_any = True
            except Exception:
                continue
    ax.set_xlim(minx, maxx)
    ax.set_ylim(miny, maxy)
    return got_any


def export_pdf(zones):
    """Page 1: map of all selected zones. Page 2: attributes table."""
    items = list(zone_shapes(zones))
    buf = io.BytesIO()

    with PdfPages(buf) as pdf:
        # ---- overview map page (all zones on satellite) ---------------
        fig, ax = plt.subplots(figsize=(11.7, 8.3))  # A4 landscape
        all_bounds = None
        for _, geom in items:
            b = geom.bounds
            if all_bounds is None:
                all_bounds = list(b)
            else:
                all_bounds[0] = min(all_bounds[0], b[0])
                all_bounds[1] = min(all_bounds[1], b[1])
                all_bounds[2] = max(all_bounds[2], b[2])
                all_bounds[3] = max(all_bounds[3], b[3])
        if all_bounds:
            _add_satellite_basemap(ax, all_bounds)

        handles = []
        for z, geom in items:
            color = z.get("color") or "#2e7d32"
            for poly in polygons_of(geom):
                xs, ys = poly.exterior.xy
                ax.fill(xs, ys, facecolor=color, alpha=0.35, edgecolor=color, linewidth=2, zorder=2)
                for ring in poly.interiors:
                    ix, iy = ring.xy
                    ax.fill(ix, iy, facecolor="white", edgecolor=color, linewidth=1, zorder=2)
            c = geom.centroid
            ax.annotate(fa(z["name"]), (c.x, c.y), ha="center", va="center",
                        fontsize=9, color="white", zorder=3,
                        bbox=dict(boxstyle="round,pad=0.2", fc="black", alpha=0.5, ec="none"))
            handles.append(Patch(facecolor=color, alpha=0.6, edgecolor=color, label=fa(z["name"])))

        ax.set_title(fa("نقشه کلی زون‌ها"))
        ax.set_xlabel("Longitude"); ax.set_ylabel("Latitude")
        ax.set_aspect("equal", adjustable="box")
        # simple north arrow
        ax.annotate("N", xy=(0.97, 0.93), xytext=(0.97, 0.83), xycoords="axes fraction",
                    ha="center", va="center", fontsize=12, fontweight="bold", color="white",
                    arrowprops=dict(arrowstyle="->", color="white", lw=2))
        if handles:
            ax.legend(handles=handles, loc="upper left", fontsize=8)
        fig.tight_layout()
        pdf.savefig(fig); plt.close(fig)

        # ---- one detailed page per zone: shape on satellite + vertices --
        for z, geom in items:
            fig, (axm, axc) = plt.subplots(1, 2, figsize=(11.7, 8.3),
                                           gridspec_kw={"width_ratios": [3, 2]})
            color = z.get("color") or "#2e7d32"
            _add_satellite_basemap(axm, geom.bounds, pad=0.4)
            for poly in polygons_of(geom):
                xs, ys = poly.exterior.xy
                axm.fill(xs, ys, facecolor=color, alpha=0.35, edgecolor=color, linewidth=2, zorder=2)
                axm.plot(xs, ys, color=color, linewidth=2, zorder=3)
            axm.set_title(fa(z["name"]))
            axm.set_aspect("equal", adjustable="box")
            axm.annotate("N", xy=(0.94, 0.92), xytext=(0.94, 0.82), xycoords="axes fraction",
                         ha="center", va="center", fontsize=12, fontweight="bold", color="white",
                         arrowprops=dict(arrowstyle="->", color="white", lw=2))

            # coordinates list (exterior ring of first polygon)
            axc.axis("off")
            polys = polygons_of(geom)
            coords = list(polys[0].exterior.coords) if polys else []
            lines = [fa("مختصات رئوس (طول, عرض):"), ""]
            for i, (lon, lat) in enumerate(coords[:40], 1):
                lines.append(f"{i:>2}.  {lat:.6f}, {lon:.6f}")
            c = geom.centroid
            lines += ["", fa("مرکز زون:"), f"{c.y:.6f}, {c.x:.6f}",
                      "", f"{fa('مساحت')}: {zone_area_ha(z):.4f} {fa('هکتار')}"]
            axc.text(0.02, 0.98, "\n".join(lines), va="top", ha="left",
                     family="monospace", fontsize=8, transform=axc.transAxes)
            fig.tight_layout()
            pdf.savefig(fig); plt.close(fig)

        # ---- attribute table page -------------------------------------
        fig, ax = plt.subplots(figsize=(11.7, 8.3))
        ax.axis("off")
        def cult_fa(z):
            return CULT_FA.get(z.get("cultivation") or "", "-")

        rows = [
            [
                fa(z["name"]), fa(z.get("province") or "-"), fa(z.get("county") or "-"),
                fa(z.get("village") or "-"), fa(z.get("owner_name") or "-"),
                fa(z.get("father_name") or "-"), fa(cult_fa(z)), fa(z.get("crop") or "-"),
                f"{zone_area_ha(z):.3f}",
            ]
            for z, geom in items
        ]
        headers = [fa(h) for h in
                   ["نام زمین", "استان", "شهرستان", "روستا", "مالک",
                    "نام پدر", "نوع کشت", "محصول", "مساحت (هکتار)"]]
        table = ax.table(
            cellText=rows or [["-"] * 9],
            colLabels=headers,
            loc="upper center",
            cellLoc="center",
        )
        table.auto_set_font_size(False)
        table.set_fontsize(8)
        table.scale(1, 1.7)
        ax.set_title(fa("مشخصات زون‌ها"), pad=20)
        pdf.savefig(fig)
        plt.close(fig)

    return buf.getvalue(), "zones.pdf", "application/pdf"
