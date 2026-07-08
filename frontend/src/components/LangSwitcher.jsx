import { useI18n } from '../context/I18nContext.jsx'

export default function LangSwitcher() {
  const { lang, setLang, langs } = useI18n()
  return (
    <div className="lang-switcher">
      {Object.entries(langs).map(([code, { label }]) => (
        <button
          key={code}
          className={code === lang ? 'active' : ''}
          onClick={() => setLang(code)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
