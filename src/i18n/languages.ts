export const LANG_KEY = 'pastapoli.lang'

export const LANGUAGES = [
  { code: 'en', flagSrc: 'https://flagcdn.com/gb.svg', name: 'English', dir: 'ltr' },
  { code: 'es', flagSrc: 'https://flagcdn.com/es.svg', name: 'Español', dir: 'ltr' },
  { code: 'fr', flagSrc: 'https://flagcdn.com/fr.svg', name: 'Français', dir: 'ltr' },
  { code: 'it', flagSrc: 'https://flagcdn.com/it.svg', name: 'Italiano', dir: 'ltr' },
  { code: 'de', flagSrc: 'https://flagcdn.com/de.svg', name: 'Deutsch', dir: 'ltr' },
  { code: 'pt', flagSrc: 'https://flagcdn.com/br.svg', name: 'Português', dir: 'ltr' },
  { code: 'ar', flagSrc: 'https://flagcdn.com/sa.svg', name: 'العربية', dir: 'rtl' },
  { code: 'zh', flagSrc: 'https://flagcdn.com/cn.svg', name: '中文', dir: 'ltr' },
  { code: 'ja', flagSrc: 'https://flagcdn.com/jp.svg', name: '日本語', dir: 'ltr' },
  { code: 'ru', flagSrc: 'https://flagcdn.com/ru.svg', name: 'Русский', dir: 'ltr' },
  { code: 'hi', flagSrc: 'https://flagcdn.com/in.svg', name: 'हिन्दी', dir: 'ltr' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']

export function languageByCode(code: string) {
  return LANGUAGES.find((lang) => lang.code === code) ?? LANGUAGES[0]
}
