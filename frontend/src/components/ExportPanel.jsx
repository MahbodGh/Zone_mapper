import { useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'

const FORMATS = [
  { id: 'kml', label: 'KML', hint: 'Google Earth' },
  { id: 'kmz', label: 'KMZ', hint: 'KML' },
  { id: 'pdf', label: 'PDF', hint: 'PDF' },
  { id: 'dxf', label: 'DXF', hint: 'AutoCAD' },
  { id: 'gdb', label: 'GDB', hint: 'Garmin' },
  { id: 'gpx', label: 'GPX', hint: 'GPS' },
]

export default function ExportPanel({ selectedCount, onExport, busy }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)   // collapsed by default
  const [formats, setFormats] = useState(new Set(['kml']))
  const [mode, setMode] = useState('separate')

  const toggleFormat = (id) =>
    setFormats((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const fileCount = mode === 'merged' ? formats.size : selectedCount * formats.size
  const isZip = fileCount > 1

  let note = t('exportHintEmpty')
  if (selectedCount > 0 && formats.size === 0) note = t('exportHintNoFormat')

  return (
    <div className={`export-panel ${expanded ? 'expanded' : 'collapsed'}`}>
      {expanded && (<div className="export-body">

      <div className="mode-row">
        <label className="mode-opt">
          <input type="radio" name="m" checked={mode === 'separate'} onChange={() => setMode('separate')} />
          <span>{t('modeSeparate')}</span>
        </label>
        <label className="mode-opt">
          <input type="radio" name="m" checked={mode === 'merged'} onChange={() => setMode('merged')} />
          <span>{t('modeMerged')}</span>
        </label>
      </div>

      <div className="format-grid">
        {FORMATS.map((f) => (
          <label key={f.id} className={`format-btn ${formats.has(f.id) ? 'active' : ''}`}>
            <input type="checkbox" checked={formats.has(f.id)} onChange={() => toggleFormat(f.id)} />
            <strong>{f.label}</strong><small>{f.hint}</small>
          </label>
        ))}
      </div>

      {selectedCount > 0 && formats.size > 0 && (
        <p className="export-note">{isZip ? `${fileCount} → ZIP` : ''}</p>
      )}
      {(selectedCount === 0 || formats.size === 0) && <p className="export-note">{note}</p>}

      <button className="btn primary full" disabled={selectedCount === 0 || formats.size === 0 || busy}
        onClick={() => onExport([...formats], mode)}>
        {busy ? t('building') : isZip ? `${t('downloadZip')} (${fileCount})` : t('downloadFile')}
      </button>
      </div>)}

      <button className="export-toggle" onClick={() => setExpanded((e) => !e)}>
        <h3>{t('exportTitle')}</h3>
        <span className="export-badge">
          {selectedCount > 0 ? selectedCount : ''}
        </span>
        <span className={`chev ${expanded ? 'up' : ''}`}>▴</span>
      </button>
    </div>
  )
}
