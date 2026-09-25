import { diamondReviveCost, isAdRevive } from '../../shared/economy'

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
  const ad = isAdRevive(nextRevive)
  const cost = diamondReviveCost(nextRevive)
  const poor = !ad && diamonds < cost

  return (
    <div className="w-full max-w-xl flex flex-col items-center gap-3">
      <p className="text-sm font-black uppercase tracking-[0.2em] text-[#ffd24d]">
        Revive {nextRevive}
      </p>
      <button
        type="button"
        disabled={busy || poor}
        onClick={onConfirm}
        className="w-full rounded-[32px] bg-[#ffd24d] py-5 text-xl font-black uppercase text-[#170d24] shadow-lg disabled:opacity-40"
      >
        {busy
          ? 'Please wait…'
          : ad
            ? `Watch 2 ads to revive (${nextRevive}/3 free)`
            : `Revive for ${cost} 💎`}
      </button>
      {!ad && (
        <p className="text-sm font-bold text-white/70">
          You have {diamonds} 💎 · next revive doubles the price
        </p>
      )}
      {error && <p className="text-sm font-bold text-[#ff7ad9]">{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={onSkip}
        className="w-full rounded-[32px] bg-white/10 py-4 text-lg font-black uppercase text-white border border-white/20 disabled:opacity-40"
      >
        Give up
      </button>
    </div>
  )
}
