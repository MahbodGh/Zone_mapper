import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import { useI18n } from '../context/I18nContext.jsx'
import { formatCoord, COORD_SYSTEMS } from '../coords.js'
import { geojsonAreaM2 } from '../geo.js'
import PlaceSearch from './PlaceSearch.jsx'

// first exterior ring of a Polygon / first polygon of a MultiPolygon
function extractRing(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return geometry.coordinates[0] || []
  if (geometry.type === 'MultiPolygon') return geometry.coordinates[0]?.[0] || []
  return []
}

// haversine distance in metres between two [lat,lng]
function haversine(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ---- GPS-walk helpers ----------------------------------------------------
// Ramer–Douglas–Peucker on lat/lng, tolerance in metres (equirectangular).
function simplifyPath(pts, tolMeters = 2) {
  if (pts.length <= 4) return pts
  const R = 6371000, rad = (d) => (d * Math.PI) / 180
  const lat0 = rad(pts[0].lat)
  const toXY = (p) => ({ x: R * rad(p.lng) * Math.cos(lat0), y: R * rad(p.lat) })
  const xy = pts.map(toXY)
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const perpDist = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (!len2) return Math.hypot(p.x - a.x, p.y - a.y)
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
  }
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    let maxD = 0, idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(xy[i], xy[s], xy[e])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > tolMeters && idx > 0) {
      keep[idx] = true
      stack.push([s, idx], [idx, e])
    }
  }
  return pts.filter((_, i) => keep[i])
}

// walk points -> closed GeoJSON Polygon ([lng,lat] rings)
function walkToPolygon(pts) {
  const simplified = simplifyPath(pts, 2)
  if (simplified.length < 3) return null
  const ring = simplified.map((p) => [p.lng, p.lat])
  ring.push([...ring[0]]) // close the ring
  return { type: 'Polygon', coordinates: [ring] }
}

export default function MapView({ zones, canEdit, onDrawn, onGeometryEdited, onZoneRemoved, focusZone }) {
  const { t, lang } = useI18n()
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const zoneGroupRef = useRef(null)
  const measureRef = useRef(null)
  const layerCtlRef = useRef({})
  const cb = useRef({})
  cb.current = { onDrawn, onGeometryEdited, onZoneRemoved }
  const [measuring, setMeasuring] = useState(false)
  const [distance, setDistance] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [coordSys, setCoordSys] = useState('latlong')
  const coordSysRef = useRef('latlong')
  coordSysRef.current = coordSys


  // ---- init map once ----
  useEffect(() => {
    if (mapRef.current) return
    const map = L.map(mapEl.current, { zoomControl: false }).setView([35.7, 51.35], 11)
    L.control.zoom({ position: 'topleft' }).addTo(map)

    // ---- base layers -------------------------------------------------
    // Esri World Imagery (high-res satellite) — default for farmland clarity
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics' }
    )
    // Google satellite as the default high-res source
    const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 21, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '&copy; Google',
    })
    const streets = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    })
    // OpenTopoMap — contour lines, good for reading slope/terrain of a field
    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17, attribution: '&copy; OpenTopoMap (CC-BY-SA)',
    })
    // Esri terrain (hillshade-style relief)
    const terrain = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 13, attribution: 'Tiles &copy; Esri' }
    )

    googleSat.addTo(map) // default: Google satellite

    // ---- overlay: place/road labels on top of satellite --------------
    const labels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: '&copy; Esri', pane: 'overlayPane' }
    )

    const baseLayers = {
      ['Google ' + t('satellite')]: googleSat,
      [t('satellite')]: satellite,
      [t('streets')]: streets,
      [t('topo')]: topo,
      [t('terrain')]: terrain,
    }
    const overlays = { [t('labels')]: labels }
    L.control.layers(baseLayers, overlays, { position: 'topright', collapsed: true }).addTo(map)
    layerCtlRef.current = { satellite, googleSat, streets }

    // ---- scale bar (metric + imperial) ----
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map)

    const zoneGroup = L.featureGroup().addTo(map)
    zoneGroupRef.current = zoneGroup
    measureRef.current = { layer: L.layerGroup().addTo(map), points: [] }

    map.pm.setGlobalOptions({
      snappable: true, snapDistance: 15,
      templineStyle: { color: '#58b573' },
      hintlineStyle: { color: '#58b573', dashArray: [5, 5] },
      pathOptions: { color: '#58b573', fillOpacity: 0.3 },
    })

    map.on('pm:create', (e) => {
      const geometry = e.layer.toGeoJSON().geometry
      e.layer.remove()
      cb.current.onDrawn(geometry)
    })

    // measurement clicks
    map.on('click', (e) => {
      const m = measureRef.current
      if (!m.active) return
      m.points.push(e.latlng)
      redrawMeasure()
    })
    map.on('dblclick', () => {
      const m = measureRef.current
      if (m.active) { m.active = false; setMeasuring(false) }
    })

    // live cursor coordinates (desktop: follows the mouse)
    map.on('mousemove', (e) => setCursor({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.on('mouseout', () => setCursor(null))
    // touch devices have no mousemove — show the coordinates of the last tap
    map.on('click', (e) => setCursor({ lat: e.latlng.lat, lng: e.latlng.lng }))

    // auto-locate on open (silent): fly to the user's position if allowed
    if (navigator.geolocation && window.isSecureContext) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          try { map.setView([pos.coords.latitude, pos.coords.longitude], 15) } catch { /* */ }
        },
        () => { /* stay on default view */ },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      )
    }

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  function redrawMeasure() {
    const m = measureRef.current
    m.layer.clearLayers()
    if (m.points.length === 0) { setDistance(null); return }
    L.polyline(m.points, { color: '#e8a13a', weight: 3, dashArray: '6 4' }).addTo(m.layer)
    m.points.forEach((p) => L.circleMarker(p, { radius: 4, color: '#e8a13a', fillOpacity: 1 }).addTo(m.layer))
    let total = 0
    for (let i = 1; i < m.points.length; i++) total += haversine(m.points[i - 1], m.points[i])
    setDistance(total)
  }

  // ---- toggle draw controls based on permission ----
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (canEdit) {
      map.pm.addControls({
        position: 'topleft',
        drawPolygon: true, drawRectangle: true, editMode: true, removalMode: true,
        drawMarker: false, drawCircleMarker: false, drawPolyline: false,
        drawCircle: false, drawText: false, dragMode: false, cutPolygon: false, rotateMode: false,
      })
    } else {
      map.pm.removeControls()
    }
  }, [canEdit])

  // ---- render zones ----
  useEffect(() => {
    const group = zoneGroupRef.current
    if (!group) return
    group.clearLayers()
    zones.forEach((z) => {
      const gj = L.geoJSON(z.geometry, {
        style: { color: z.color, weight: 2, fillColor: z.color, fillOpacity: 0.3 },
      })
      gj.eachLayer((layer) => {
        const by = z.owner_fullname || z.owner_username
        const created = z.created_at ? new Date(z.created_at).toLocaleString(lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar' : 'fa-IR') : ''
        layer.bindTooltip(
          `<strong>${z.name}</strong><br/>${z.province || '—'}${z.county ? ' / ' + z.county : ''}<br/>${by ? `${t('createdBy')}: ${by}` : ''}`,
          { sticky: true, direction: 'top' }
        )
        // click a zone -> popup listing its vertex coordinates in the chosen system
        layer.on('click', () => {
          try {
            const coords = extractRing(z.geometry)
            const lines = coords.slice(0, 30)
              .map((c, i) => `${i + 1}. ${formatCoord(c[1], c[0], coordSysRef.current)}`)
              .join('<br/>')
            const html =
              `<div class="coord-popup"><strong>${z.name}</strong>` +
              `<div class="coord-meta">${by ? t('createdBy') + ': ' + by : ''}` +
              `${created ? '<br/>' + t('drawnAt') + ': ' + created : ''}</div>` +
              `<div class="coord-sys">${coordSysRef.current.toUpperCase()}</div>` +
              `<div class="coord-list">${lines}</div></div>`
            L.popup({ maxWidth: 320, maxHeight: 280 })
              .setLatLng(layer.getBounds().getCenter())
              .setContent(html)
              .openOn(mapRef.current)
          } catch { /* */ }
        })
        if (canEdit) {
          layer.on('pm:update', (e) => cb.current.onGeometryEdited(z.id, e.layer.toGeoJSON().geometry))
          layer.on('pm:remove', () => cb.current.onZoneRemoved(z.id))
        }
        group.addLayer(layer)
      })
    })
  }, [zones, canEdit, lang, coordSys])

  // ---- fly to focused zone ----
  useEffect(() => {
    if (!focusZone || !mapRef.current) return
    try {
      const b = L.geoJSON(focusZone.geometry).getBounds()
      mapRef.current.fitBounds(b, { padding: [40, 40] })
    } catch { /* */ }
  }, [focusZone])

  const startMeasure = () => {
    const m = measureRef.current
    m.active = true; m.points = []; m.layer.clearLayers()
    setDistance(null); setMeasuring(true)
  }
  const clearMeasure = () => {
    const m = measureRef.current
    m.active = false; m.points = []; m.layer.clearLayers()
    setDistance(null); setMeasuring(false)
  }

  const fmtDist = (d) =>
    d >= 1000 ? `${(d / 1000).toFixed(2)} ${t('km')}` : `${Math.round(d)} ${t('m')}`

  // ---- GPS: locate the user and fly there ----
  const [locating, setLocating] = useState(false)
  const locateMarkerRef = useRef(null)
  const locateMe = () => {
    if (!mapRef.current) return
    if (!navigator.geolocation) {
      alert(t('gpsUnavailable')); return
    }
    // browsers block geolocation on non-secure origins (plain http over an IP).
    // localhost is treated as secure; a LAN IP is not.
    if (!window.isSecureContext) {
      alert(t('gpsInsecure')); return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        const map = mapRef.current
        map.flyTo([latitude, longitude], 16, { duration: 1 })
        if (locateMarkerRef.current) locateMarkerRef.current.remove()
        const grp = L.layerGroup().addTo(map)
        L.circle([latitude, longitude], { radius: accuracy, color: '#1e88e5', weight: 1, fillOpacity: 0.12 }).addTo(grp)
        L.circleMarker([latitude, longitude], { radius: 7, color: '#fff', weight: 2, fillColor: '#1e88e5', fillOpacity: 1 })
          .addTo(grp).bindTooltip(t('youAreHere'), { permanent: false })
        locateMarkerRef.current = grp
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        // 1 = permission denied, 2 = position unavailable, 3 = timeout
        if (err.code === 1) alert(t('gpsDenied'))
        else if (err.code === 2) alert(t('gpsPositionUnavailable'))
        else if (err.code === 3) alert(t('gpsTimeout'))
        else alert(t('gpsDenied'))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  // ---- fly to a searched place ----
  const goToPlace = ({ lat, lon }) => {
    if (!mapRef.current) return
    mapRef.current.flyTo([lat, lon], 14, { duration: 1 })
    const grp = L.layerGroup().addTo(mapRef.current)
    L.marker([lat, lon]).addTo(grp)
    setTimeout(() => grp.remove(), 6000)
  }

  // ---- GPS walk: record the user's path around the field -> zone ----
  // 'idle' | 'recording' | 'paused'
  const [walkStatus, setWalkStatus] = useState('idle')
  const [walkCount, setWalkCount] = useState(0)
  const [walkArea, setWalkArea] = useState(0)
  const walkRef = useRef({ points: [], watchId: null, status: 'idle', layer: null })
  const wakeLockRef = useRef(null)

  const MIN_STEP_M = 3        // ignore jitter smaller than this
  const MAX_ACCURACY_M = 30   // ignore fixes with worse accuracy

  const setStatus = (s) => { walkRef.current.status = s; setWalkStatus(s) }

  const redrawWalk = () => {
    const w = walkRef.current
    const map = mapRef.current
    if (!map) return
    if (!w.layer) w.layer = L.layerGroup().addTo(map)
    w.layer.clearLayers()
    if (!w.points.length) return
    // start flag + live path + current position dot
    L.circleMarker(w.points[0], { radius: 6, color: '#fff', weight: 2, fillColor: '#e8a13a', fillOpacity: 1 })
      .addTo(w.layer)
    if (w.points.length > 1) {
      L.polyline(w.points, { color: '#e8a13a', weight: 4, opacity: 0.9 }).addTo(w.layer)
      // preview of the closing edge back to the start
      L.polyline([w.points[w.points.length - 1], w.points[0]],
        { color: '#e8a13a', weight: 2, dashArray: '4 6', opacity: 0.7 }).addTo(w.layer)
    }
    const last = w.points[w.points.length - 1]
    L.circleMarker(last, { radius: 7, color: '#fff', weight: 2, fillColor: '#1e88e5', fillOpacity: 1 })
      .addTo(w.layer)
  }

  const onWalkFix = (pos) => {
    const w = walkRef.current
    if (w.status !== 'recording') return
    const { latitude, longitude, accuracy } = pos.coords
    if (accuracy > MAX_ACCURACY_M && w.points.length > 0) return   // keep the first fix regardless
    const p = { lat: latitude, lng: longitude }
    const last = w.points[w.points.length - 1]
    if (last && haversine(last, p) < MIN_STEP_M) return
    w.points.push(p)
    setWalkCount(w.points.length)
    if (w.points.length >= 3) {
      const poly = walkToPolygon([...w.points])
      setWalkArea(poly ? geojsonAreaM2(poly) : 0)
    }
    redrawWalk()
    mapRef.current?.panTo(p, { animate: true })
  }

  const acquireWakeLock = async () => {
    try { wakeLockRef.current = await navigator.wakeLock?.request('screen') } catch { /* optional */ }
  }
  const releaseWakeLock = () => {
    try { wakeLockRef.current?.release() } catch { /* */ }
    wakeLockRef.current = null
  }

  const startWalk = () => {
    if (!navigator.geolocation) { alert(t('gpsUnavailable')); return }
    if (!window.isSecureContext) { alert(t('gpsInsecure')); return }
    const w = walkRef.current
    w.points = []
    setWalkCount(0); setWalkArea(0)
    setStatus('recording')
    acquireWakeLock()
    mapRef.current?.setZoom(Math.max(mapRef.current.getZoom(), 17))
    w.watchId = navigator.geolocation.watchPosition(
      onWalkFix,
      (err) => {
        stopWatch()
        setStatus('idle')
        if (err.code === 1) alert(t('gpsDenied'))
        else if (err.code === 2) alert(t('gpsPositionUnavailable'))
        else alert(t('gpsTimeout'))
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }

  const stopWatch = () => {
    const w = walkRef.current
    if (w.watchId != null) { navigator.geolocation.clearWatch(w.watchId); w.watchId = null }
    releaseWakeLock()
  }

  const pauseWalk = () => setStatus('paused')
  const resumeWalk = () => setStatus('recording')

  const cancelWalk = () => {
    stopWatch()
    walkRef.current.points = []
    walkRef.current.layer?.clearLayers()
    setWalkCount(0); setWalkArea(0)
    setStatus('idle')
  }

  const finishWalk = () => {
    const w = walkRef.current
    stopWatch()
    const poly = walkToPolygon(w.points)
    if (!poly) {
      alert(t('walkTooFew'))
      // keep the recording so the user can continue instead of losing it
      if (w.points.length) { setStatus('paused'); return }
      cancelWalk(); return
    }
    w.points = []
    w.layer?.clearLayers()
    setWalkCount(0); setWalkArea(0)
    setStatus('idle')
    cb.current.onDrawn(poly)   // -> same zone form as manual drawing
  }

  // stop watching + release wake lock if the component unmounts mid-walk
  useEffect(() => () => stopWatch(), [])

  return (
    <div className="map-container">
      <div ref={mapEl} className="map" />

      {/* place search (Google-Maps style) */}
      <div className="map-search">
        <PlaceSearch onSelect={goToPlace} />
      </div>

      {/* GPS locate button */}
      <button className={`gps-btn ${locating ? 'active' : ''}`} onClick={locateMe} title={t('myLocation')}>
        {locating ? '◎' : '📍'}
      </button>

      {/* GPS walk: start button (hidden while recording) */}
      {canEdit && walkStatus === 'idle' && (
        <button className="walk-btn" onClick={startWalk} title={t('walkStart')}>
          🚶 <span className="walk-btn-label">{t('walkStart')}</span>
        </button>
      )}

      {/* GPS walk: live control panel */}
      {walkStatus !== 'idle' && (
        <div className="walk-panel">
          <div className="walk-status">
            <span className={`walk-dot ${walkStatus === 'recording' ? 'rec' : 'paused'}`} />
            <strong>{walkStatus === 'recording' ? t('walkRecording') : t('walkPausedLbl')}</strong>
            <small>
              {walkCount} {t('walkPoints')}
              {walkArea > 0 && ` · ${(walkArea / 10000).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} ${t('areaHa')}`}
            </small>
          </div>
          {walkCount < 3 && <p className="walk-hint">{t('walkHint')}</p>}
          <div className="walk-actions">
            {walkStatus === 'recording'
              ? <button className="walk-act pause" onClick={pauseWalk}>⏸ {t('walkPause')}</button>
              : <button className="walk-act resume" onClick={resumeWalk}>▶ {t('walkResume')}</button>}
            <button className="walk-act finish" disabled={walkCount < 3} onClick={finishWalk}>
              ✓ {t('walkFinish')}
            </button>
            <button className="walk-act cancel" onClick={cancelWalk}>✕ {t('walkCancel')}</button>
          </div>
        </div>
      )}

      {/* compass / north indicator */}
      <div className="compass" title="North">
        <div className="compass-arrow">▲</div>
        <span className="compass-n">N</span>
      </div>

      <div className="map-tools">
        {!measuring ? (
          <button className="tool-btn" onClick={startMeasure} title={t('measureDistance')}>📏 {t('measureDistance')}</button>
        ) : (
          <button className="tool-btn active" onClick={clearMeasure}>✕ {t('clearMeasure')}</button>
        )}
        {measuring && <span className="measure-hint">{t('measureHint')}</span>}
        {distance != null && (
          <span className="measure-result">{t('totalDistance')}: <strong>{fmtDist(distance)}</strong></span>
        )}
      </div>

      {/* coordinate readout + system switcher */}
      <div className="coord-bar">
        <div className="coord-sys-switch">
          {COORD_SYSTEMS.map((sys) => (
            <button key={sys} className={sys === coordSys ? 'active' : ''} onClick={() => setCoordSys(sys)}>
              {sys === 'latlong' ? 'Lat/Long' : 'UTM (WGS84)'}
            </button>
          ))}
        </div>
        {cursor && <span className="coord-live">{formatCoord(cursor.lat, cursor.lng, coordSys)}</span>}
      </div>
    </div>
  )
}
