import { useEffect, useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'
import { api } from '../api.js'

const TYPE_KEY = { frost: 'alertFrost', wind: 'alertWind', heat: 'alertHeat' }
const TYPE_ICON = { frost: '❄️', wind: '💨', heat: '🔥' }

export default function AlertsPanel({ notify, isAdmin }) {
  const { t, lang } = useI18n()
  const [alerts, setAlerts] = useState([])
  const [busy, setBusy] = useState(false)

  const load = () => api.listAlerts().then(setAlerts).catch((e) => notify(e.message))
  useEffect(() => { load() }, [])

  const scan = async () => {
    setBusy(true)
    try { const r = await api.scanAlerts(); notify(`${t('scanNow')}: +${r.created ?? 0}`); load() }
    catch (e) { notify(e.message) } finally { setBusy(false) }
  }

  const decide = async (id, decision) => {
    try { await api.decideAlert(id, decision); load() }
    catch (e) { notify(e.message) }
  }

  const fmt = (iso) => iso ? new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar' : 'fa-IR') : ''

  return (
    <div className="panel-scroll">
      <div className="panel-head">
        <h2 className="panel-title">{t('weatherAlerts')}</h2>
        <button className="btn primary sm" disabled={busy} onClick={scan}>
          {busy ? '…' : '🌦 ' + t('scanNow')}
        </button>
      </div>

      {alerts.length === 0 && <div className="empty">{t('noAlerts')}</div>}
      <div className="alert-list">
        {alerts.map((a) => (
          <div key={a.id} className={`alert-row ${a.status}`}>
            <span className="alert-icon">{TYPE_ICON[a.alert_type] || '⚠️'}</span>
            <div className="alert-info">
              <strong>{t(TYPE_KEY[a.alert_type] || 'weatherAlerts')} — {a.zone_name}</strong>
              <small>{a.message}</small>
              <span className="alert-time">{fmt(a.created_at)}</span>
            </div>
            <div className="alert-actions">
              <span className={`alert-status ${a.status}`}>{t(a.status)}</span>
              {isAdmin && a.status === 'pending' && (
                <>
                  <button className="badge ok" onClick={() => decide(a.id, 'approved')}>{t('approve')}</button>
                  <button className="badge off" onClick={() => decide(a.id, 'rejected')}>{t('reject')}</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
