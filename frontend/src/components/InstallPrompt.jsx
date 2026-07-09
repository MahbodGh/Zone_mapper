import { useEffect, useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'

/**
 * "Install app on your phone" banner. Shows ONCE, then never again after the
 * user dismisses or installs (persisted in localStorage).
 *
 * - Android/Chrome (HTTPS): uses the native beforeinstallprompt for one-tap install.
 * - iOS/Safari or non-installable contexts: shows a manual "Add to Home Screen" hint.
 */
export default function InstallPrompt() {
  const { t } = useI18n()
  const [deferred, setDeferred] = useState(null)
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    // already installed / running as an app?
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone
    if (standalone) return
    if (localStorage.getItem('zm_pwa_dismissed')) return

    const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
    if (!isMobile) return

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

    // native install prompt (Android/Chrome, requires HTTPS + valid manifest)
    const onPrompt = (e) => {
      e.preventDefault()
      setDeferred(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // fallback: if the native event never fires within 2.5s, show a manual hint
    const timer = setTimeout(() => {
      setShow((cur) => {
        if (cur) return cur           // native prompt already showed
        setIosHint(true)              // manual instructions (works for iOS + http)
        return true
      })
    }, 2500)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  const install = async () => {
    if (deferred) {
      deferred.prompt()
      await deferred.userChoice
      setDeferred(null)
    }
    dismiss()
  }

  const dismiss = () => {
    setShow(false)
    localStorage.setItem('zm_pwa_dismissed', '1')   // never show again
  }

  if (!show) return null

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

  return (
    <div className="pwa-prompt">
      <div className="pwa-icon">◈</div>
      <div className="pwa-text">
        {t('installPrompt')}
        {iosHint && (
          <div style={{ marginTop: 4, opacity: 0.85, fontSize: '0.75rem' }}>
            {isIOS ? 'Safari: ⎙ ← ' + t('addToHome') : (t('menu') + ' ⋮ ← ' + t('addToHome'))}
          </div>
        )}
      </div>
      <div className="pwa-actions">
        {deferred && <button className="pwa-install" onClick={install}>{t('install')}</button>}
        <button className="pwa-later" onClick={dismiss}>{deferred ? t('later') : t('gotIt')}</button>
      </div>
    </div>
  )
}
