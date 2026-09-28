import { diamondReviveCost, isAdRevive } from '../../shared/economy'
import { useI18n } from '../i18n/I18n'

export default function ReviveOffer({
  nextRevive,
  diamonds,
  busy,
  error,
  onConfirm,
  onSkip,
}: {
  nextRevive: number
  diamonds: number
  busy: boolean
  error: string | null
  onConfirm: () => void
  onSkip: () => void
}) {
  const { t } = useI18n()
  const ad = isAdRevive(nextRevive)
  const cost = diamondReviveCost(nextRevive)
  const poor = !ad && diamonds < cost

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-3">
      <p className="text-sm font-black uppercase tracking-[0.2em] text-[#ffd24d]">
        {t('revive.title', { n: nextRevive })}
      </p>
      <button
        type="button"
        disabled={busy || poor}
        onClick={onConfirm}
        className="w-full rounded-[32px] bg-[#ffd24d] py-5 text-xl font-black uppercase text-[#170d24] shadow-lg disabled:opacity-40"
      >
        {busy
          ? t('revive.wait')
          : ad
            ? t('revive.watch')
            : t('revive.forDiamonds', { cost })}
      </button>
      {!ad && (
        <p className="text-sm font-bold text-white/70">
          {t('revive.balance', { diamonds })}
        </p>
      )}
      {error && <p className="text-sm font-bold text-[#ff7ad9]">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={onSkip}
        className="w-full rounded-[32px] bg-white/10 py-4 text-lg font-black uppercase text-white border border-white/20 disabled:opacity-40"
      >
        {t('revive.giveUp')}
      </button>
    </div>
  )
}
