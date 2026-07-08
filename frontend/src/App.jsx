import { useCallback, useEffect, useMemo, useState } from 'react'
import MapView from './components/MapView.jsx'
import ZoneForm from './components/ZoneForm.jsx'
import ZoneList from './components/ZoneList.jsx'
import ExportPanel from './components/ExportPanel.jsx'
import UsersPanel from './components/UsersPanel.jsx'
import LogsPanel from './components/LogsPanel.jsx'
import AlertsPanel from './components/AlertsPanel.jsx'
import PasswordModal from './components/PasswordModal.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import LangSwitcher from './components/LangSwitcher.jsx'
import { api } from './api.js'
import { geojsonAreaM2 } from './geo.js'
import { useI18n } from './context/I18nContext.jsx'
import { useAuth } from './context/AuthContext.jsx'

export default function App() {
  const { t } = useI18n()
  const { user, loading, logout } = useAuth()
  const [tab, setTab] = useState('map')       // 'map' | 'users' | 'logs' | 'alerts'
  const [showPassword, setShowPassword] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)  // sidebar open on phones
  const [zones, setZones] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [form, setForm] = useState(null)
  const [focusZone, setFocusZone] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [backendDown, setBackendDown] = useState(false)

  const [query, setQuery] = useState('')
  const [regionFilter, setRegionFilter] = useState('')
  const [userFilter, setUserFilter] = useState('')

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(''), 5000) }

  const refresh = useCallback(async () => {
    if (!user) return
    try { setZones(await api.listZones()); setBackendDown(false) }
    catch (e) { if (e.status !== 401) { setBackendDown(true); notify(t('backendDown')) } }
  }, [user, t])

  useEffect(() => { refresh() }, [refresh])

  // whether the current user can draw/edit (everyone with an account can, in their own scope)
  const canEdit = !!user

  const regions = useMemo(() => [...new Set(zones.map((z) => z.region).filter(Boolean))].sort(), [zones])
  const usersList = useMemo(() => [...new Set(zones.map((z) => z.owner_username).filter(Boolean))].sort(), [zones])
  // show the "who created it" column only when the user actually has sub-users' zones
  const showUserColumn = usersList.length > 1 || (user && user.role === 'superadmin')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return zones.filter((z) => {
      if (regionFilter && z.region !== regionFilter) return false
      if (userFilter && z.owner_username !== userFilter) return false
      if (!q) return true
      return [z.name, z.region, z.owner, z.owner_username, z.owner_fullname]
        .some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [zones, query, regionFilter, userFilter])

  const handleDrawn = async (geometry) => {
    setForm({ geometry })
    // auto-detect province/county from the zone centroid (offline reverse-geocode)
    try {
      const ring = geometry.type === 'Polygon' ? geometry.coordinates[0]
        : geometry.type === 'MultiPolygon' ? geometry.coordinates[0][0] : []
      if (ring.length) {
        const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length
        const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length
        const geo = await api.reverseGeocode(lon, lat)
        if (geo && (geo.province || geo.county)) {
          setForm((f) => f ? { ...f, autoGeo: geo } : f)
        }
      }
    } catch { /* geocode is best-effort */ }
  }

  const handleSaveForm = async (fields) => {
    setBusy(true)
    try {
      if (form.zone) {
        await api.updateZone(form.zone.id, { ...fields, geometry: form.zone.geometry })
        notify(`${fields.name} ${t('zoneUpdated')}`)
      } else {
        await api.createZone({ ...fields, geometry: form.geometry })
        notify(`${fields.name} ${t('zoneSaved')}`)
      }
      setForm(null); await refresh()
    } catch (e) { notify(e.message) } finally { setBusy(false) }
  }

  const handleGeometryEdited = async (id, geometry) => {
    try {
      const z = zones.find((x) => x.id === id); if (!z) return
      await api.updateZone(id, { ...z, geometry })
      await refresh(); notify(t('borderUpdated'))
    } catch (e) { notify(e.message); refresh() }
  }

  const removeZones = async (ids) => {
    try {
      for (const id of ids) await api.deleteZone(id)
      setSelected((s) => new Set([...s].filter((x) => !ids.includes(x))))
      await refresh()
    } catch (e) { notify(e.message); refresh() }
  }

  const handleDeleteZone = (zone) => {
    if (window.confirm(`${zone.name} — ${t('deleteConfirm')}`)) removeZones([zone.id])
  }

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const selectShown = () => {
    const shown = filtered.map((z) => z.id)
    setSelected((s) => {
      const allIn = shown.length > 0 && shown.every((id) => s.has(id))
      const next = new Set(s)
      shown.forEach((id) => (allIn ? next.delete(id) : next.add(id)))
      return next
    })
  }

  const handleExport = async (formats, mode) => {
    setBusy(true)
    try { await api.exportZones([...selected], formats, mode); notify(t('exportDone')) }
    catch (e) { notify(e.message) } finally { setBusy(false) }
  }

  if (loading) return <div className="boot">…</div>
  if (!user) return <AuthScreen />

  return (
    <div className={`layout ${mobileOpen ? 'mobile-open' : ''}`}>
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-top">
            <div>
              <h1>{t('appName')}</h1>
              <p>{user.first_name} {user.last_name} · @{user.username}</p>
            </div>
            <div className="brand-actions">
              <button className="logout-btn" onClick={() => setShowPassword(true)} title={t('changePassword')}>🔒</button>
              <button className="logout-btn" onClick={logout} title={t('logout')}>⏻</button>
            </div>
          </div>
          <div className="brand-controls">
            <LangSwitcher />
          </div>
          <div className="tabs">
            <button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}>{t('tabMap')}</button>
            <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>{t('tabUsers')}</button>
            <button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}>{t('tabAlerts')}</button>
            <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>{t('tabLogs')}</button>
          </div>
          {backendDown && <div className="banner">{t('backendDown')}</div>}
        </header>

        {tab === 'map' && (
          <>
            <ZoneList
              zones={filtered} total={zones.length} selected={selected}
              showUserColumn={showUserColumn}
              query={query} setQuery={setQuery}
              regionFilter={regionFilter} setRegionFilter={setRegionFilter} regions={regions}
              userFilter={userFilter} setUserFilter={setUserFilter} usersList={usersList}
              onToggle={toggle} onSelectShown={selectShown} onClearSelection={() => setSelected(new Set())}
              onEdit={(z) => setForm({ zone: z })} onDelete={handleDeleteZone}
              onFocus={(z) => { setFocusZone({ ...z, _t: Date.now() }); setMobileOpen(false) }}
            />
            <ExportPanel selectedCount={selected.size} onExport={handleExport} busy={busy} />
          </>
        )}
        {tab === 'users' && <UsersPanel notify={notify} />}
        {tab === 'alerts' && <AlertsPanel notify={notify} isAdmin={user.role === 'superadmin'} />}
        {tab === 'logs' && <LogsPanel notify={notify} />}
      </aside>

      {/* mobile toggle button (only visible on phones via CSS) */}
      <button className="mobile-toggle" onClick={() => setMobileOpen((o) => !o)}>
        {mobileOpen ? '✕' : '☰'}
      </button>

      <main className="map-wrap">
        <MapView
          zones={zones} canEdit={canEdit && tab === 'map'}
          onDrawn={handleDrawn} onGeometryEdited={handleGeometryEdited}
          onZoneRemoved={(id) => removeZones([id])} focusZone={focusZone}
        />
      </main>

      {showPassword && <PasswordModal onClose={() => setShowPassword(false)} notify={notify} />}
      {form && (
        <ZoneForm
          initial={form.zone}
          autoGeo={form.autoGeo}
          geometry={form.geometry || form.zone?.geometry}
          areaM2={geojsonAreaM2(form.geometry || form.zone?.geometry)}
          busy={busy}
          onSave={handleSaveForm}
          onCancel={() => setForm(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
