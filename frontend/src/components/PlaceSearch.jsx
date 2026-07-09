import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'
import { api } from '../api.js'

/**
 * Google-Maps-style place search.
 * Order of attempts: (1) Nominatim direct, (2) Photon direct,
 * (3) our own backend proxy (works even when the client network blocks
 * the geocoders or the browser hits their rate limit).
 * Stale requests are aborted so fast typing can't trigger rate-limiting.
 */
export default function PlaceSearch({ onSelect }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [errored, setErrored] = useState(false)
  const boxRef = useRef(null)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  const cacheRef = useRef(new Map())   // query -> results

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setResults([]) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  async function searchNominatim(q, langParam, signal) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2`
      + `&q=${encodeURIComponent(q)}&countrycodes=ir&limit=6&accept-language=${langParam}`
    const res = await fetch(url, { signal, headers: { 'Accept-Language': langParam } })
    if (!res.ok) throw new Error('nominatim ' + res.status)
    const data = await res.json()
    return (data || []).map((d) => ({
      lat: parseFloat(d.lat), lon: parseFloat(d.lon), label: d.display_name,
    }))
  }

  async function searchPhoton(q, langParam, signal) {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}`
      + `&lang=${langParam}&lat=32.4&lon=53.6&limit=6`
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error('photon ' + res.status)
    const data = await res.json()
    return (data.features || []).map((f) => {
      const p = f.properties || {}
      const [lon, lat] = f.geometry.coordinates
      const parts = [p.name, p.city, p.county, p.state, p.country].filter(Boolean)
      return { lat, lon, label: [...new Set(parts)].join('، ') }
    })
  }

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = query.trim()
    if (q.length < 2) { setResults([]); setErrored(false); setLoading(false); return }

    // cached?
    if (cacheRef.current.has(q)) {
      const hit = cacheRef.current.get(q)
      setResults(hit); setErrored(hit.length === 0); return
    }

    timerRef.current = setTimeout(async () => {
      // cancel any in-flight request so we never stack queries (rate-limit killer)
      if (abortRef.current) abortRef.current.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      setLoading(true); setErrored(false)
      const langParam = lang === 'en' ? 'en' : lang === 'ar' ? 'ar' : 'fa'
      let items = []
      try { items = await searchNominatim(q, langParam, ctrl.signal) } catch (e) {
        if (e.name === 'AbortError') return
      }
      if (items.length === 0) {
        try { items = await searchPhoton(q, langParam, ctrl.signal) } catch (e) {
          if (e.name === 'AbortError') return
        }
      }
      // last resort: our backend proxy (immune to client-side blocks)
      if (items.length === 0) {
        try { items = await api.geoSearch(q, langParam) } catch { /* */ }
      }
      if (ctrl.signal.aborted) return
      cacheRef.current.set(q, items)
      setResults(items)
      setErrored(items.length === 0)
      setLoading(false)
    }, 600)
  }, [query, lang])

  const pick = (r) => {
    onSelect(r)
    setResults([])
    setQuery(r.label.length > 40 ? r.label.slice(0, 40) + '…' : r.label)
    setOpen(false)
  }

  return (
    <div className={`place-search ${open ? 'open' : ''}`} ref={boxRef}>
      {!open ? (
        <button className="place-search-icon" onClick={() => setOpen(true)} title={t('searchPlace')}>
          🔍
        </button>
      ) : (
        <div className="place-search-box">
          <span className="ps-lead">🔍</span>
          <input
            autoFocus
            value={query}
            placeholder={t('searchPlace')}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) pick(results[0]) }}
          />
          {query && <button className="ps-clear" onClick={() => { setQuery(''); setResults([]); setErrored(false) }}>✕</button>}
          <button className="ps-close" onClick={() => { setOpen(false); setResults([]); setQuery(''); setErrored(false) }}>✕</button>
        </div>
      )}

      {open && (results.length > 0 || loading || errored) && (
        <div className="ps-results">
          {loading && <div className="ps-loading">…</div>}
          {!loading && errored && <div className="ps-loading">{t('searchNoResult')}</div>}
          {results.map((r, i) => (
            <button key={i} className="ps-result" onClick={() => pick(r)}>
              <span className="ps-pin">📍</span>
              <span className="ps-label">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
