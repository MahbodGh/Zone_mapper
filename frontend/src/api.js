const BASE = '/api'

let authToken = localStorage.getItem('zm_token') || null
export function setToken(tok) {
  authToken = tok
  if (tok) localStorage.setItem('zm_token', tok)
  else localStorage.removeItem('zm_token')
}

function authHeaders(extra = {}) {
  const h = { ...extra }
  if (authToken) h.Authorization = `Bearer ${authToken}`
  return h
}

async function json(res) {
  if (!res.ok) {
    let msg = `خطای سرور (${res.status})`
    try {
      const body = await res.json()
      if (body.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch { /* ignore */ }
    const err = new Error(msg)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  // ---- auth ----
  register: (payload) =>
    fetch(`${BASE}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(json),

  login: async (username, password) => {
    // OAuth2 password flow expects form-encoded body
    const body = new URLSearchParams({ username, password })
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    return json(res)
  },

  me: () => fetch(`${BASE}/auth/me`, { headers: authHeaders() }).then(json),

  // ---- users ----
  listUsers: () => fetch(`${BASE}/users`, { headers: authHeaders() }).then(json),
  createUser: (payload) =>
    fetch(`${BASE}/users`, {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }).then(json),
  updateUser: (id, payload) =>
    fetch(`${BASE}/users/${id}`, {
      method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }).then(json),
  deleteUser: (id) =>
    fetch(`${BASE}/users/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json),

  // ---- zones ----
  listZones: () => fetch(`${BASE}/zones`, { headers: authHeaders() }).then(json),
  createZone: (zone) =>
    fetch(`${BASE}/zones`, {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(zone),
    }).then(json),
  updateZone: (id, zone) =>
    fetch(`${BASE}/zones/${id}`, {
      method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(zone),
    }).then(json),
  deleteZone: (id) =>
    fetch(`${BASE}/zones/${id}`, { method: 'DELETE', headers: authHeaders() }).then(json),

  // ---- export ----
  // ---- place search via backend proxy ----
  geoSearch: (q, lang) =>
    fetch(`${BASE}/zones/geosearch?q=${encodeURIComponent(q)}&lang=${lang}`,
      { headers: authHeaders() }).then(json),

  // ---- reverse geocode (point -> admin divisions) ----
  reverseGeocode: (lon, lat) =>
    fetch(`${BASE}/zones/reverse-geocode`, {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ lon, lat }),
    }).then(json),

  // ---- password ----
  changePassword: (current_password, new_password) =>
    fetch(`${BASE}/auth/change-password`, {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ current_password, new_password }),
    }).then(json),

  // ---- activity logs ----
  listLogs: () => fetch(`${BASE}/logs`, { headers: authHeaders() }).then(json),

  // ---- weather alerts ----
  scanAlerts: () => fetch(`${BASE}/alerts/scan`, { method: 'POST', headers: authHeaders() }).then(json),
  listAlerts: (status) =>
    fetch(`${BASE}/alerts${status ? `?status=${status}` : ''}`, { headers: authHeaders() }).then(json),
  decideAlert: (id, status) =>
    fetch(`${BASE}/alerts/${id}/decide`, {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    }).then(json),

  async exportZones(zoneIds, formats, mode = 'separate') {
    const res = await fetch(`${BASE}/export`, {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ zone_ids: zoneIds, formats, mode }),
    })
    if (!res.ok) {
      let msg = `خطا در خروجی گرفتن (${res.status})`
      try { const b = await res.json(); if (b.detail) msg = b.detail } catch { /* */ }
      throw new Error(msg)
    }
    const blob = await res.blob()
    const cd = res.headers.get('Content-Disposition') || ''
    const star = cd.match(/filename\*=UTF-8''([^;]+)/)
    const plain = cd.match(/filename="?([^";]+)"?/)
    const filename = star ? decodeURIComponent(star[1]) : plain ? plain[1] : 'zones_export.zip'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  },
}
