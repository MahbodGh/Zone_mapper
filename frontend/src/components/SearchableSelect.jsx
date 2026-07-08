import { useEffect, useRef, useState } from 'react'

/**
 * A dropdown with a search box. Also allows free-typing when `allowCustom`.
 * options: string[]
 */
export default function SearchableSelect({
  value, onChange, options, placeholder, disabled, allowCustom = false, searchPlaceholder = 'جستجو…',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options

  const pick = (val) => { onChange(val); setOpen(false); setQuery('') }

  return (
    <div className={`ss ${disabled ? 'disabled' : ''}`} ref={boxRef}>
      <button type="button" className="ss-trigger" disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}>
        <span className={value ? '' : 'ss-placeholder'}>{value || placeholder}</span>
        <span className="ss-caret">▾</span>
      </button>

      {open && (
        <div className="ss-pop">
          <input className="ss-search" autoFocus value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && allowCustom && query.trim()) pick(query.trim())
            }} />
          <div className="ss-list">
            {allowCustom && query.trim() && !options.includes(query.trim()) && (
              <button type="button" className="ss-opt ss-custom" onClick={() => pick(query.trim())}>
                + «{query.trim()}»
              </button>
            )}
            {filtered.length === 0 && !allowCustom && <div className="ss-empty">موردی یافت نشد</div>}
            {filtered.map((o) => (
              <button type="button" key={o} className={`ss-opt ${o === value ? 'active' : ''}`}
                onClick={() => pick(o)}>{o}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
