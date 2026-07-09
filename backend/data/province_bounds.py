"""Approximate bounding boxes (minlon, minlat, maxlon, maxlat) for Iran's 31
provinces. Used as a fallback when a detailed boundary GeoJSON isn't present —
gives at least province-level auto-detection anywhere in the country.

These are coarse rectangles; overlaps are resolved by picking the smallest box
that contains the point (usually the correct province)."""

PROVINCE_BBOX = {
    "آذربایجان شرقی": (45.0, 36.6, 48.3, 39.4),
    "آذربایجان غربی": (44.0, 35.9, 47.5, 39.8),
    "اردبیل": (47.3, 37.4, 48.9, 39.8),
    "اصفهان": (49.0, 30.7, 55.5, 34.4),
    "البرز": (50.3, 35.5, 51.5, 36.5),
    "ایلام": (45.4, 32.0, 48.4, 34.4),
    "بوشهر": (50.0, 27.3, 52.6, 30.3),
    "تهران": (50.3, 34.6, 53.0, 36.5),
    "چهارمحال و بختیاری": (49.6, 31.2, 51.6, 32.8),
    "خراسان جنوبی": (57.0, 30.8, 60.9, 34.5),
    "خراسان رضوی": (56.3, 33.8, 61.3, 37.7),
    "خراسان شمالی": (55.9, 36.5, 58.4, 38.3),
    "خوزستان": (47.6, 29.9, 50.6, 33.1),
    "زنجان": (47.2, 35.6, 49.5, 37.3),
    "سمنان": (51.7, 34.3, 57.3, 37.0),
    "سیستان و بلوچستان": (58.7, 25.0, 63.4, 31.5),
    "فارس": (50.6, 27.0, 55.7, 31.4),
    "قزوین": (48.8, 35.4, 50.7, 36.8),
    "قم": (50.3, 34.1, 51.9, 35.2),
    "کردستان": (45.5, 34.7, 48.5, 36.5),
    "کرمان": (54.3, 26.4, 59.5, 32.1),
    "کرمانشاه": (45.3, 33.6, 48.3, 35.4),
    "کهگیلویه و بویراحمد": (49.7, 30.0, 51.7, 31.6),
    "گلستان": (53.8, 36.4, 56.5, 38.1),
    "گیلان": (48.5, 36.6, 50.6, 38.5),
    "لرستان": (46.7, 32.6, 50.3, 34.4),
    "مازندران": (50.3, 35.8, 54.3, 37.1),
    "مرکزی": (49.0, 33.6, 51.3, 35.5),
    "هرمزگان": (52.5, 25.4, 59.4, 28.9),
    "همدان": (48.0, 34.2, 49.5, 35.7),
    "یزد": (52.6, 29.8, 56.6, 33.5),
}


def province_from_point(lon: float, lat: float) -> str:
    """Pick the smallest bounding box containing the point."""
    best, best_area = "", float("inf")
    for name, (mnx, mny, mxx, mxy) in PROVINCE_BBOX.items():
        if mnx <= lon <= mxx and mny <= lat <= mxy:
            area = (mxx - mnx) * (mxy - mny)
            if area < best_area:
                best, best_area = name, area
    return best
