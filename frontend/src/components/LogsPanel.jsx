import { useEffect, useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'
import { api } from '../api.js'

const ACTION_LABEL = {
  login: '🔑', zone_create: '➕', zone_update: '✎', zone_delete: '🗑', password_change: '🔒',
}

export default function LogsPanel({ notify }) {
  const { t, lang } = useI18n()
  const [logs, setLogs] = useState([])

  useEffect(() => { api.listLogs().then(setLogs).catch((e) => notify(e.message)) }, [])

  const fmt = (iso) => iso ? new Date(iso).toLocaleString(lang === 'en' ? 'en-US' : lang === 'ar' ? 'ar' : 'fa-IR') : ''

  return (
    <div className="panel-scroll">
      <h2 className="panel-title">{t('activityLogs')}</h2>
      {logs.length === 0 && <div className="empty">{t('noLogs')}</div>}
      <div className="log-list">
        {logs.map((l) => (
          <div key={l.id} className="log-row">
            <span className="log-icon">{ACTION_LABEL[l.action] || '•'}</span>
            <div className="log-info">
              <strong>@{l.username}</strong>
              <small>{l.detail || l.action}</small>
            </div>
            <span className="log-time">{fmt(l.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
