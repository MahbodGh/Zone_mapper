// Client-side geodesic area (m²) for live preview in the form.
// Matches the server's pyproj result closely enough for display.
export function geojsonAreaM2(geometry) {
  if (!geometry) return 0
  const R = 6378137 // WGS84 semi-major axis
  const rad = (d) => (d * Math.PI) / 180

  function ringArea(coords) {
    let total = 0
    const n = coords.length
    if (n < 3) return 0
    for (let i = 0; i < n; i++) {
      const [lon1, lat1] = coords[i]
      const [lon2, lat2] = coords[(i + 1) % n]
      total += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)))
    }
    return Math.abs((total * R * R) / 2)
  }

  function polyArea(rings) {
    if (!rings.length) return 0
    let a = ringArea(rings[0])
    for (let i = 1; i < rings.length; i++) a -= ringArea(rings[i]) // holes
    return a
  }

  if (geometry.type === 'Polygon') return polyArea(geometry.coordinates)
  if (geometry.type === 'MultiPolygon')
    return geometry.coordinates.reduce((s, p) => s + polyArea(p), 0)
  return 0
}
