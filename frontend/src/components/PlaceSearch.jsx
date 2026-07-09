import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'

/**
 * Google-Maps-style place search. Uses the free Photon geocoder
 * (https://photon.komoot.io) — no API key. Results are biased to Iran.
 * On pick, calls onSelect({ lat, lon, label }).
 */
export default function PlaceSearch({ onSelect }) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const boxRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setResults([]) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const langParam = lang === 'en' ? 'en' : 'fa'
        // bias around Iran's centre; limit to a handful of hits
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}`
          + `&lang=${langParam}&lat=32.4&lon=53.6&limit=6`
        const res = await fetch(url)
        const data = await res.json()
        const items = (data.features || []).map((f) => {
          const p = f.properties || {}
          const [lon, lat] = f.geometry.coordinates
          const parts = [p.name, p.city, p.county, p.state, p.country].filter(Boolean)
          return { lat, lon, label: [...new Set(parts)].join('، ') }
        })
        setResults(items)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
  }, [query, lang])

  const pick = (r) => {
    onSelect(r)
    setResults([])
    setQuery(r.label)
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
          {query && <button className="ps-clear" onClick={() => { setQuery(''); setResults([]) }}>✕</button>}
          <button className="ps-close" onClick={() => { setOpen(false); setResults([]); setQuery('') }}>✕</button>
        </div>
      )}

      {open && (results.length > 0 || loading) && (
        <div className="ps-results">
          {loading && <div className="ps-loading">…</div>}
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
