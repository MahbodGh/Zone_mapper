import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'
import { PROVINCES, countiesOf } from '../i18n/iranRegions.js'
import SearchableSelect from './SearchableSelect.jsx'

const PALETTE = ['#2e7d32', '#1e88e5', '#e53935', '#f9a825', '#8e24aa', '#00897b', '#6d4c41', '#3949ab']

export default function ZoneForm({ initial, autoGeo, geometry, areaM2, busy, onSave, onCancel }) {
  const { t, lang } = useI18n()
  const [f, setF] = useState({
    name: '', province: '', county: '', district: '', village: '',
    owner_name: '', father_name: '', owner_mobile: '', cultivation: 'irrigated', crop: '', color: PALETTE[0],
  })
  const [error, setError] = useState('')
  const [geoApplied, setGeoApplied] = useState(false)
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  const setE = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    setF({
      name: initial?.name || '',
      province: initial?.province || '',
      county: initial?.county || '',
      district: initial?.district || '',
      village: initial?.village || '',
      owner_name: initial?.owner_name || '',
      father_name: initial?.father_name || '',
      owner_mobile: initial?.owner_mobile || '',
      cultivation: initial?.cultivation || 'irrigated',
      crop: initial?.crop || '',
      color: initial?.color || PALETTE[0],
    })
    setError('')
    setGeoApplied(false)
  }, [initial])

  // apply auto-detected province/county/district/village once, without overwriting typed values
  useEffect(() => {
    if (!autoGeo || geoApplied) return
    setF((s) => ({
      ...s,
      province: s.province || autoGeo.province || '',
      county: s.county || autoGeo.county || '',
      district: s.district || autoGeo.district || '',
      village: s.village || autoGeo.village || '',
    }))
    setGeoApplied(true)
  }, [autoGeo, geoApplied])

  const counties = useMemo(() => countiesOf(f.province), [f.province])

  // area in hectares (from server-side value for edits, or live-computed for new zones)
  const ha = (areaM2 ?? initial?.area_m2 ?? 0) / 10000

  const submit = () => {
    if (!f.name.trim()) { setError(t('nameRequired')); return }
    onSave({ ...f, name: f.name.trim() })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>{initial?.id ? t('editZone') : t('newZone')}</h2>

        <div className="form-grid">
          <label className="col2">{t('landName')} <span className="req">*</span>
            <input value={f.name} onChange={setE('name')} autoFocus />
          </label>

          <div className="field">
            <span className="field-label">
              {t('province')}
              {autoGeo?.province && <span className="auto-badge">✓ {t('autoDetected')}</span>}
            </span>
            <SearchableSelect value={f.province} onChange={(v) => setF((s) => ({ ...s, province: v, county: '' }))}
              options={PROVINCES} placeholder={t('selectProvince')} searchPlaceholder={t('searchProvince')} />
          </div>

          <div className="field">
            <span className="field-label">{t('county')}</span>
            <SearchableSelect value={f.county} onChange={set('county')}
              options={counties} disabled={!f.province}
              placeholder={f.province ? t('typeOrSelect') : t('selectCounty')}
              searchPlaceholder={t('searchCounty')} allowCustom />
          </div>

          <label>{t('district')}
            <input value={f.district} onChange={setE('district')} placeholder={t('typeOrSelect')} />
          </label>
          <label>{t('village')}
            <input value={f.village} onChange={setE('village')} />
          </label>

          <label>{t('ownerNameF')}
            <input value={f.owner_name} onChange={setE('owner_name')} />
          </label>
          <label>{t('fatherName')}
            <input value={f.father_name} onChange={setE('father_name')} />
          </label>

          <label>{t('ownerMobile')}
            <input value={f.owner_mobile} onChange={setE('owner_mobile')}
              placeholder="09xxxxxxxxx" inputMode="tel" style={{ direction: 'ltr' }} />
          </label>

          <div className="field">
            <span className="field-label">{t('cultivation')}</span>
            <div className="seg">
              <button type="button" className={f.cultivation === 'irrigated' ? 'active' : ''}
                onClick={() => set('cultivation')('irrigated')}>{t('irrigated')}</button>
              <button type="button" className={f.cultivation === 'rainfed' ? 'active' : ''}
                onClick={() => set('cultivation')('rainfed')}>{t('rainfed')}</button>
            </div>
          </div>
          <label>{t('crop')}
            <input value={f.crop} onChange={setE('crop')} />
          </label>

          <div className="field col2 area-box">
            <span className="field-label">{t('area')}</span>
            <div className="area-value">
              <strong>{ha.toLocaleString(lang === 'en' ? 'en' : 'fa', { maximumFractionDigits: 4 })}</strong> {t('areaHa')}
              <small>({Math.round(areaM2 ?? initial?.area_m2 ?? 0).toLocaleString()} m²)</small>
            </div>
            <span className="area-hint">{t('areaAuto')}</span>
          </div>

          <div className="field col2">
            <span className="field-label">{t('zoneColor')}</span>
            <div className="swatches">
              {PALETTE.map((c) => (
                <button key={c} type="button" className={`swatch ${c === f.color ? 'active' : ''}`}
                  style={{ background: c }} onClick={() => set('color')(c)} />
              ))}
              <input type="color" value={f.color} onChange={setE('color')} title={t('customColor')} />
            </div>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel}>{t('cancel')}</button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
