import { createContext, useContext, useEffect, useState } from 'react'
import { translations, LANGS } from '../i18n/translations.js'

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('zm_lang')
    return saved && LANGS[saved] ? saved : 'fa'
  })

  useEffect(() => {
    localStorage.setItem('zm_lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = LANGS[lang].dir
  }, [lang])

  const t = (key) => translations[lang]?.[key] ?? translations.fa[key] ?? key
  const dir = LANGS[lang].dir

  return (
    <I18nContext.Provider value={{ lang, setLang, t, dir, langs: LANGS }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)
