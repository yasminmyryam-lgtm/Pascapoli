import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Dictionary, MessageKey } from './dictionary'
import { DICTS } from './translations'
import { LANG_KEY, languageByCode, type LangCode } from './languages'

type Vars = Record<string, string | number>

type I18nValue = {
  lang: LangCode
  setLang: (code: LangCode) => void
  t: (key: MessageKey, vars?: Vars) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function readLang(): LangCode {
  try {
    return languageByCode(localStorage.getItem(LANG_KEY) ?? '').code
  } catch {
    return 'en'
  }
}

function applyDirection(code: LangCode) {
  const dir = code === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = code
  document.documentElement.dir = dir
  document.body.dir = dir
}

function fill(template: string, vars?: Vars) {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''))
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(readLang)

  const setLang = useCallback((code: LangCode) => {
    setLangState(code)
    try { localStorage.setItem(LANG_KEY, code) } catch {}
  }, [])

  useEffect(() => {
    applyDirection(lang)
  }, [lang])

  const t = useCallback((key: MessageKey, vars?: Vars) => {
    const table: Dictionary = DICTS[lang] ?? DICTS.en
    return fill(table[key] ?? DICTS.en[key] ?? key, vars)
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
