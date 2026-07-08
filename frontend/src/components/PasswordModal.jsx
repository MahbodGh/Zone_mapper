import { useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'
import { api } from '../api.js'

export default function PasswordModal({ onClose, notify }) {
  const { t } = useI18n()
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [cf, setCf] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (nw.length < 6) { setError(t('nameRequired')); return }
    if (nw !== cf) { setError(t('pwMismatch')); return }
    setBusy(true)
    try {
      await api.changePassword(cur, nw)
      notify(t('pwChanged'))
      onClose()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('changePassword')}</h2>
        <label>{t('currentPassword')}
          <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus />
        </label>
        <label>{t('newPassword')}
          <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} />
        </label>
        <label>{t('confirmPassword')}
          <input type="password" value={cf} onChange={(e) => setCf(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
