import { useEffect, useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'

/**
 * Shows a "Install app on your phone?" banner.
 * - Android/Chrome: uses the native beforeinstallprompt event.
 * - iOS/Safari: shows manual "Add to Home Screen" hint (no native prompt exists).
 */
export default function InstallPrompt() {
  const { t } = useI18n()
  const [deferred, setDeferred] = useState(null)
  const [show, setShow] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    // already installed / running standalone?
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone
    if (standalone) return
    if (localStorage.getItem('zm_pwa_dismissed')) return

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
    if (!isMobile) return

    const onPrompt = (e) => {
      e.preventDefault()
      setDeferred(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iOS never fires beforeinstallprompt → show a manual hint after a delay
    if (isIOS) {
      const timer = setTimeout(() => { setIosHint(true); setShow(true) }, 2500)
      return () => { clearTimeout(timer); window.removeEventListener('beforeinstallprompt', onPrompt) }
    }
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
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
    localStorage.setItem('zm_pwa_dismissed', '1')
  }

  if (!show) return null

  return (
    <div className="pwa-prompt">
      <div className="pwa-icon">◈</div>
      <div className="pwa-text">
        {t('installPrompt')}
        {iosHint && <div style={{ marginTop: 4, opacity: 0.8 }}>Safari → ⎙ → Add to Home Screen</div>}
      </div>
      <div className="pwa-actions">
        {!iosHint && <button className="pwa-install" onClick={install}>{t('install')}</button>}
        <button className="pwa-later" onClick={dismiss}>{t('later')}</button>
      </div>
    </div>
  )
}
