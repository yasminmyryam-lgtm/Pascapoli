export const LANG_KEY = 'pastapoli.lang'

export const LANGUAGES = [
  { code: 'en', flag: '🇬🇧', name: 'English', dir: 'ltr' },
  { code: 'es', flag: '🇪🇸', name: 'Español', dir: 'ltr' },
  { code: 'fr', flag: '🇫🇷', name: 'Français', dir: 'ltr' },
  { code: 'it', flag: '🇮🇹', name: 'Italiano', dir: 'ltr' },
  { code: 'de', flag: '🇩🇪', name: 'Deutsch', dir: 'ltr' },
  { code: 'pt', flag: '🇧🇷', name: 'Português', dir: 'ltr' },
  { code: 'ar', flag: '🇸🇦', name: 'العربية', dir: 'rtl' },
  { code: 'zh', flag: '🇨🇳', name: '中文', dir: 'ltr' },
  { code: 'ja', flag: '🇯🇵', name: '日本語', dir: 'ltr' },
  { code: 'ru', flag: '🇷🇺', name: 'Русский', dir: 'ltr' },
  { code: 'hi', flag: '🇮🇳', name: 'हिन्दी', dir: 'ltr' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']

export function languageByCode(code: string) {
  return LANGUAGES.find((lang) => lang.code === code) ?? LANGUAGES[0]
}
