import { createContext, useContext, useState, useCallback } from 'react'
import { translations } from '../i18n/index.js'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(
    () => localStorage.getItem('fuel_lang') || 'es'
  )

  const setLang = useCallback((code) => {
    if (!translations[code]) return
    setLangState(code)
    localStorage.setItem('fuel_lang', code)
  }, [])

  const t = useCallback((key) => {
    return (translations[lang] && translations[lang][key])
      || (translations['es'] && translations['es'][key])
      || key
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLang = () => useContext(LanguageContext)
