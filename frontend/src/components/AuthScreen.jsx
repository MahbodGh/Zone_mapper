import { useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../api.js'
import LangSwitcher from './LangSwitcher.jsx'

export default function AuthScreen() {
  const { t } = useI18n()
  const { login } = useAuth()
  const [mode, setMode] = useState('login')   // 'login' | 'register'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // shared fields
  const [ident, setIdent] = useState('')        // login: username or email
  const [password, setPassword] = useState('')
  // register-only
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  const submitLogin = async () => {
    setError(''); setBusy(true)
    try {
      await login(ident.trim(), password)
    } catch (e) {
      setError(e.message || t('wrongCreds'))
    } finally { setBusy(false) }
  }

  const submitRegister = async () => {
    setError(''); setSuccess(''); setBusy(true)
    try {
      await api.register({
        email: email.trim(), username: username.trim(),
        first_name: firstName.trim(), last_name: lastName.trim(),
        password,
      })
      setSuccess(t('registerDone'))
      setMode('login')
      setIdent(username.trim())
      setPassword('')
    } catch (e) {
      setError(e.message)
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-lang"><LangSwitcher /></div>
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">◈</div>
          <h1>{t('appName')}</h1>
          <p>{t('tagline')}</p>
        </div>

        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>
            {t('login')}
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>
            {t('register')}
          </button>
        </div>

        {success && <div className="auth-success">{success}</div>}
        {error && <div className="auth-error">{error}</div>}

        {mode === 'login' ? (
          <div className="auth-form">
            <label>{t('usernameOrEmail')}
              <input value={ident} onChange={(e) => setIdent(e.target.value)} autoFocus />
            </label>
            <label>{t('password')}
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitLogin()} />
            </label>
            <button className="auth-submit" disabled={busy} onClick={submitLogin}>
              {busy ? '…' : t('loginBtn')}
            </button>
            <p className="auth-switch">
              {t('noAccount')} <button onClick={() => { setMode('register'); setError('') }}>{t('register')}</button>
            </p>
          </div>
        ) : (
          <div className="auth-form">
            <div className="auth-row">
              <label>{t('firstName')}
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </label>
              <label>{t('lastName')}
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </label>
            </div>
            <label>{t('email')}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>{t('username')}
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label>{t('password')}
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitRegister()} />
            </label>
            <button className="auth-submit" disabled={busy} onClick={submitRegister}>
              {busy ? '…' : t('registerBtn')}
            </button>
            <p className="auth-switch">
              {t('haveAccount')} <button onClick={() => { setMode('login'); setError('') }}>{t('login')}</button>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
