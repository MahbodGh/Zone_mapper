// Coordinate formatting: WGS84 decimal, lat/long DMS, and UTM.

// ---- UTM (WGS84) from lat/lon ----
export function latLonToUTM(lat, lon) {
  const a = 6378137.0            // WGS84 major axis
  const f = 1 / 298.257223563
  const k0 = 0.9996
  const e2 = f * (2 - f)
  const ep2 = e2 / (1 - e2)

  let zone = Math.floor((lon + 180) / 6) + 1
  const latBand = 'CDEFGHJKLMNPQRSTUVWXX'
  const bandIdx = Math.max(0, Math.min(19, Math.floor((lat + 80) / 8)))
  const band = latBand[bandIdx]

  const latR = (lat * Math.PI) / 180
  const lonR = (lon * Math.PI) / 180
  const lonOrigin = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180)

  const N = a / Math.sqrt(1 - e2 * Math.sin(latR) ** 2)
  const T = Math.tan(latR) ** 2
  const C = ep2 * Math.cos(latR) ** 2
  const A = Math.cos(latR) * (lonR - lonOrigin)

  const M = a * (
    (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latR
    - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * latR)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latR)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * latR)
  )

  let easting = k0 * N * (A + ((1 - T + C) * A ** 3) / 6
    + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000.0

  let northing = k0 * (M + N * Math.tan(latR) * (
    (A ** 2) / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24
    + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720))
  if (lat < 0) northing += 10000000.0

  return { zone, band, easting, northing, hemisphere: lat >= 0 ? 'N' : 'S' }
}

function toDMS(deg, isLat) {
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W')
  const abs = Math.abs(deg)
  const d = Math.floor(abs)
  const mFloat = (abs - d) * 60
  const m = Math.floor(mFloat)
  const s = ((mFloat - m) * 60).toFixed(1)
  return `${d}°${m}'${s}"${dir}`
}

// Format a single [lat, lon] pair in the chosen system.
export function formatCoord(lat, lon, system) {
  if (system === 'utm') {
    const u = latLonToUTM(lat, lon)
    return `${u.zone}${u.band} ${Math.round(u.easting)}E ${Math.round(u.northing)}N`
  }
  if (system === 'dms') {
    return `${toDMS(lat, true)}, ${toDMS(lon, false)}`
  }
  // wgs84 decimal
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`
}

export const COORD_SYSTEMS = ['wgs84', 'dms', 'utm']
