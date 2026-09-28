import { useState } from 'react'
import { useI18n } from './I18n'
import { LANGUAGES, languageByCode } from './languages'

function Flag({ src }: { src: string }) {
  return <img src={src} alt="" width={24} height={18} className="h-[18px] w-6 shrink-0 rounded-sm object-cover" />
}

export default function LanguageMenu({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const current = languageByCode(lang)

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('settings.language')}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-2xl bg-black/40 px-3 py-2 text-sm font-black text-white"
      >
        <Flag src={current.flagSrc} />
        <span>{current.name}</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-2 max-h-72 w-56 overflow-y-auto rounded-2xl border border-white/10 bg-[#1f1333] p-1 shadow-2xl"
        >
          {LANGUAGES.map((option) => {
            const on = option.code === lang
            return (
              <button
                key={option.code}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  setLang(option.code)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start text-sm font-bold ${on ? 'bg-[#ffd24d] text-[#170d24]' : 'text-white hover:bg-white/10'}`}
              >
                <Flag src={option.flagSrc} />
                <span>{option.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
