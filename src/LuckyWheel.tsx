import React, { useEffect, useState } from 'react'
import { COSMETICS } from './cosmetics'
import { isFounder, useActions, useGameState, spinRemaining } from './store'
import { sfx } from './sfx'
import { playRewardedAdSequence } from './ads/adService'
import { authorizeDouble } from './economy/economyApi'

type Prize = { id: string; label: string; color: string; coins?: number; diamonds?: number; xp?: number; cosmetic?: boolean }
const PRIZES: Prize[] = [
  { id: 'c100', label: '+100', color: '#6ee7a8', coins: 100 },
  { id: 'xp50', label: '+50\nXP', color: '#8ec5ff', xp: 50 },
  { id: 'c250', label: '+250', color: '#b98bff', coins: 250 },
  { id: 'cos', label: 'COSMETIC\nITEM', color: '#ff7ad9', cosmetic: true },
  { id: 'c500', label: '+500', color: '#ff9d6b', coins: 500 },
  { id: 'again', label: 'TRY\nAGAIN', color: '#5a4a70' },
  { id: 'c1000', label: '+1000', color: '#ffd24d', coins: 1000 },
  { id: 'xp150', label: '+150\nXP', color: '#7ad0ff', xp: 150 },
]

const SEG = 360 / PRIZES.length
function fmt(ms: number) {
  const s = Math.ceil(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

type Pending = {
  prize: Prize
  coins: number
  diamonds: number
  xp: number
  cosmeticId?: string
}

export default function LuckyWheel({ onClose }: { onClose: () => void }) {
  const { lastSpin, cosmetics } = useGameState()
  const { addCoins, addXp, grantCosmetic, setLastSpin } = useActions()

  const [angle, setAngle] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<Prize | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [claimed, setClaimed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  const remaining = spinRemaining(lastSpin, now)
  const freeSpin = remaining <= 0 && !spinning && !pending

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const land = (prize: Prize) => {
    if (prize.id === 'again') {
      sfx.win()
      setResult(prize)
      setPending(null)
      setClaimed(true)
      return
    }
    let cosmeticId: string | undefined
    let label = prize.label
    if (prize.cosmetic) {
      const locked = isFounder() ? [] : COSMETICS.filter((c) => !cosmetics.includes(c.id))
      const gift = locked[Math.floor(Math.random() * locked.length)] ?? COSMETICS[0]
      cosmeticId = gift.id
      label = gift.name
    }
    sfx.win()
    const next: Pending = {
      prize: { ...prize, label },
      coins: prize.coins ?? 0,
      diamonds: prize.diamonds ?? 0,
      xp: prize.xp ?? 0,
      cosmeticId,
    }
    setPending(next)
    setResult(next.prize)
    setClaimed(false)
  }

  const spin = (consumeFree: boolean) => {
    if (spinning || pending) return
    setResult(null)
    setError(null)
    const idx = Math.floor(Math.random() * PRIZES.length)
    const prize = PRIZES[idx]
    const base = angle - (angle % 360)
    const target = base + 360 * 6 + ((360 - idx * SEG) % 360)
    setSpinning(true)
    setAngle(target)
    if (consumeFree) setLastSpin(Date.now())

    window.setTimeout(() => {
      setSpinning(false)
      land(prize)
    }, 4200)
  }

  const extraSpin = async () => {
    if (spinning || pending || busy) return
    setBusy(true)
    setError(null)
    const watched = await playRewardedAdSequence(2)
    setBusy(false)
    if (!watched) {
      setError('Watch both ads for an extra spin.')
      return
    }
    spin(false)
  }

  const claim = async (doubled: boolean) => {
    if (!pending || claimed || busy) return
    if (doubled) {
      setBusy(true)
      const watched = await playRewardedAdSequence(2)
      if (!watched) {
        setError('Watch both ads to double the prize.')
        setBusy(false)
        return
      }
    }
    const authorized = await authorizeDouble('wheel', {
      coins: pending.coins,
      diamonds: pending.diamonds,
    }, doubled)
    const payout = authorized.ok ? authorized.payout : {
      coins: pending.coins * (doubled ? 2 : 1),
      diamonds: pending.diamonds * (doubled ? 2 : 1),
    }
    if (payout.coins) addCoins(payout.coins)
    if (pending.xp) addXp(pending.xp * (doubled ? 2 : 1))
    if (pending.cosmeticId) {
      grantCosmetic(pending.cosmeticId)
      if (doubled) {
        const locked = isFounder() ? [] : COSMETICS.filter((c) => !cosmetics.includes(c.id) && c.id !== pending.cosmeticId)
        const extra = locked[Math.floor(Math.random() * locked.length)]
        if (extra) grantCosmetic(extra.id)
      }
    }
    setClaimed(true)
    setBusy(false)
    setError(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-[380px] overflow-hidden rounded-[28px] border border-white/15 p-6 text-center bg-[#1a0d2e]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white">✕</button>
        <p className="font-display text-[11px] uppercase tracking-[0.35em] text-[#ffb8ec]">🎡 Daily</p>
        <h2 className="font-display text-2xl font-700 text-white">Lucky Wheel</h2>
        
        <div className="relative mx-auto mt-5 h-64 w-64">
          <div className="absolute left-1/2 top-[-6px] z-20 -translate-x-1/2"><div className="h-0 w-0 border-x-[12px] border-t-[20px] border-x-transparent border-t-[#ffd24d]" /></div>
          <svg viewBox="0 0 200 200" className="h-64 w-64 drop-shadow-[0_10px_30px_rgba(255,122,217,0.35)]" style={{ transform: `rotate(${angle}deg)`, transition: spinning ? 'transform 4.1s cubic-bezier(0.16,1,0.3,1)' : 'none' }}>
            <circle cx="100" cy="100" r="98" fill="#1a0d2e" />
            {PRIZES.map((p, i) => {
              const a0 = (i * SEG - 90 - SEG / 2) * (Math.PI / 180); const a1 = ((i + 1) * SEG - 90 - SEG / 2) * (Math.PI / 180); const r = 94
              const x0 = 100 + r * Math.cos(a0); const y0 = 100 + r * Math.sin(a0); const x1 = 100 + r * Math.cos(a1); const y1 = 100 + r * Math.sin(a1)
              const mid = (i * SEG - 90) * (Math.PI / 180); const tx = 100 + 60 * Math.cos(mid); const ty = 100 + 60 * Math.sin(mid)
              return (
                <g key={p.id}>
                  <path d={`M100 100 L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z`} fill={p.color} stroke="#1a0d2e" strokeWidth="1.5" />
                  <text x={tx} y={ty} fill={p.id === 'again' ? '#fff' : '#1a0d2e'} fontSize="11" fontWeight="700" fontFamily="sans-serif" textAnchor="middle" transform={`rotate(${i * SEG} ${tx} ${ty})`}>
                    {p.label.split('\n').map((line, li) => (<tspan key={li} x={tx} dy={li === 0 ? 0 : 11}>{line}</tspan>))}
                  </text>
                </g>
              )
            })}
            <circle cx="100" cy="100" r="16" fill="#ffd24d" stroke="#1a0d2e" strokeWidth="3" />
          </svg>
        </div>

        {result && !spinning && (
          <div className="mt-4">
            <p className="font-display text-lg font-700 text-white">{result.id === 'again' ? '😅 So close!' : claimed ? '🎉 Claimed!' : '🎉 You won!'}</p>
            <p className="whitespace-pre-line font-display text-2xl font-700 text-[#ffd24d]">{result.id === 'again' ? 'Spin again with ads or wait' : result.label}</p>
          </div>
        )}

        {error && <p className="mt-3 text-sm font-bold text-[#ff7ad9]">{error}</p>}

        <div className="mt-5 flex flex-col gap-2">
          {pending && !claimed && !spinning ? (
            <>
              <button type="button" disabled={busy} onClick={() => { void claim(false) }} className="w-full rounded-full bg-[#6ee7a8] py-3 text-xl font-bold uppercase text-[#1a0d2e] disabled:opacity-40">Claim</button>
              <button type="button" disabled={busy} onClick={() => { void claim(true) }} className="w-full rounded-full bg-[#ffd24d] py-3 text-xl font-bold uppercase text-[#1a0d2e] disabled:opacity-40">{busy ? 'Please wait…' : 'Double Prize (2 Ads)'}</button>
            </>
          ) : spinning ? (
            <button disabled className="w-full rounded-full bg-white/10 py-3 text-xl font-bold uppercase text-white/70">Spinning…</button>
          ) : freeSpin ? (
            <button onClick={() => spin(true)} className="w-full rounded-full bg-[#ffd24d] py-3 text-xl font-bold uppercase text-[#1a0d2e]">Spin the wheel!</button>
          ) : (
            <>
              <div className="rounded-full bg-white/10 py-3 text-white"><span className="text-sm text-white/60">Next free spin in </span><span className="text-lg font-bold text-[#ffd24d]">{fmt(remaining)}</span></div>
              <button type="button" disabled={busy || Boolean(pending && !claimed)} onClick={() => { void extraSpin() }} className="w-full rounded-full bg-[#ff7ad9] py-3 text-xl font-bold uppercase text-[#1a0d2e] disabled:opacity-40">
                {busy ? 'Please wait…' : 'Extra Spin (2 Ads)'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
