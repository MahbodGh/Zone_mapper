"""Weather integration (Open-Meteo, free & keyless) + alert rule engine + SMS stub."""
import json
import os
import urllib.request
from datetime import datetime, timezone

from shapely.geometry import shape

# ---- crop sensitivity rules -------------------------------------------------
# Frost-sensitive crops (Persian names). Extend freely.
FROST_SENSITIVE = {"سیر", "انگور", "گوجه", "گوجه‌فرنگی", "خیار", "مرکبات", "پرتقال", "لیمو", "بادام", "زردآلو", "هلو"}
FROST_TEMP_C = 0.0          # below this -> frost alert
WIND_SPRAY_KMH = 25.0       # above this -> spraying-risk alert
HEAT_TEMP_C = 40.0          # above this -> heat-stress alert


def zone_centroid(geometry: dict):
    """(lon, lat) of a GeoJSON polygon centroid."""
    try:
        c = shape(geometry).centroid
        return c.x, c.y
    except Exception:
        return None


def fetch_forecast_48h(lon: float, lat: float) -> dict | None:
    """Call Open-Meteo for hourly temp + wind for the next 48h. No API key needed."""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat:.4f}&longitude={lon:.4f}"
        "&hourly=temperature_2m,wind_speed_10m"
        "&forecast_days=2&timezone=auto"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception:
        return None


def analyze_zone(zone) -> list[dict]:
    """Return a list of alert dicts (not yet persisted) for one zone."""
    center = zone_centroid(json.loads(zone.geometry) if isinstance(zone.geometry, str) else zone.geometry)
    if not center:
        return []
    lon, lat = center
    fc = fetch_forecast_48h(lon, lat)
    if not fc or "hourly" not in fc:
        return []

    temps = fc["hourly"].get("temperature_2m", []) or []
    winds = fc["hourly"].get("wind_speed_10m", []) or []
    if not temps:
        return []

    min_temp = min(temps)
    max_temp = max(temps)
    max_wind = max(winds) if winds else 0.0
    crop = (zone.crop or "").strip()
    alerts = []

    # frost
    if min_temp <= FROST_TEMP_C:
        crop_risky = crop in FROST_SENSITIVE
        alerts.append({
            "alert_type": "frost",
            "severity": "danger" if crop_risky else "warning",
            "forecast_value": round(min_temp, 1),
            "message": (
                f"هشدار سرمازدگی: دمای پیش‌بینی‌شده تا {min_temp:.1f}° در زمین «{zone.name}»"
                + (f" (محصول حساس: {crop})" if crop_risky else "")
                + ". تدابیر حفاظتی را انجام دهید."
            ),
        })

    # spraying wind risk
    if max_wind >= WIND_SPRAY_KMH:
        alerts.append({
            "alert_type": "wind",
            "severity": "warning",
            "forecast_value": round(max_wind, 1),
            "message": (
                f"هشدار باد: سرعت باد تا {max_wind:.0f} کیلومتر بر ساعت در زمین «{zone.name}». "
                "از سم‌پاشی خودداری کنید."
            ),
        })

    # heat stress
    if max_temp >= HEAT_TEMP_C:
        alerts.append({
            "alert_type": "heat",
            "severity": "warning",
            "forecast_value": round(max_temp, 1),
            "message": (
                f"هشدار گرمای شدید: دمای پیش‌بینی‌شده تا {max_temp:.0f}° در زمین «{zone.name}». "
                "آبیاری و مدیریت تنش گرمایی را در نظر بگیرید."
            ),
        })

    return alerts


# ---- SMS gateway (stub — plug your Iranian panel here later) ---------------
def send_sms(to: str, text: str) -> bool:
    """Placeholder SMS sender. Set SMS_ENABLED=1 and implement the real HTTP
    call to your panel (Kavenegar / MelliPayamak / ...) inside the block below.

    Returns True on (simulated) success."""
    if not to:
        return False
    if os.getenv("SMS_ENABLED") == "1":
        # === TODO: real gateway call ===
        # Example (Kavenegar):
        #   import urllib.request, urllib.parse
        #   api = os.getenv("SMS_API_KEY")
        #   sender = os.getenv("SMS_SENDER")
        #   url = f"https://api.kavenegar.com/v1/{api}/sms/send.json"
        #   data = urllib.parse.urlencode({"receptor": to, "sender": sender, "message": text}).encode()
        #   urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=15)
        try:
            # real implementation goes here
            return True
        except Exception:
            return False
    # simulation mode: log to console so you can see it working end-to-end
    print(f"[SMS-SIMULATED] to={to} :: {text}")
    return True
