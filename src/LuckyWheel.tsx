import React, { useEffect, useRef, useState } from 'react'
import { AccessoryArt, CharacterView, COSMETICS, COSMETIC_RARITY, TYPE_LABEL, cosmeticById } from './cosmetics'
import { isAccessoryCompatibleById } from './accessoryCompatibility'
import { isFounder, useActions, useGameState, spinRemaining } from './store'
import { sfx } from './sfx'
import { showRewardedAd } from './ads/adService'
import { authorizeDouble } from './economy/economyApi'

type Prize = { id: string; label: string; color: string; coins?: number; diamonds?: number; xp?: number; cosmetic?: boolean }
const PRIZES: Prize[] = [
  { id: 'c100', label: '+100', color: '#6ee7a8', coins: 100 },
  { id: 'xp50', label: '+50\nXP', color: '#8ec5ff', xp: 50 },
  { id: 'c250', label: '+250', color: '#b98bff', coins: 250 },
  { id: 'cos', label: 'SKIN', color: '#ff7ad9', cosmetic: true },
  { id: 'c500', label: '+500', color: '#ff9d6b', coins: 500 },
  { id: 'again', label: 'TRY\nAGAIN', color: '#5a4a70' },
  { id: 'c1000', label: '+1000', color: '#ffd24d', coins: 1000 },
  { id: 'xp150', label: '+150\nXP', color: '#7ad0ff', xp: 150 },
]

const SEG = 360 / PRIZES.length
const SLICE_RIM = 94
const LABEL_EDGE_PAD = 12
const LABEL_HALF = (SEG / 2) * (Math.PI / 180)

function sliceLines(label: string): string[] {
  return label.split('\n').flatMap((part) => {
    const words = part.trim().split(/\s+/).filter(Boolean)
    if (words.length <= 1) return words
    const mid = Math.ceil(words.length / 2)
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')]
  })
}

function layoutSliceText(label: string) {
  const lines = sliceLines(label)
  const tan = Math.tan(LABEL_HALF)
  const outerLimit = SLICE_RIM - LABEL_EDGE_PAD
  let fontSize = 10
  while (fontSize >= 6) {
    const lineGap = fontSize * 1.15
    const width = Math.max(...lines.map((line) => line.length * fontSize * 0.62), 1)
    const height = lineGap * Math.max(lines.length, 1)
    const halfW = width / 2
    const halfH = height / 2
    const minRadius = halfH + halfW / tan + 4
    const maxRadius = Math.sqrt(Math.max(0, outerLimit * outerLimit - halfW * halfW)) - halfH
    if (minRadius <= maxRadius) {
      return { lines, fontSize, radius: Math.min(Math.max(minRadius, 56), maxRadius), lineGap }
    }
    fontSize -= 0.5
  }
  return { lines, fontSize: 6, radius: 52, lineGap: 7 }
}
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
  const { lastSpin, cosmetics, selected, equipped } = useGameState()
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

  // Peg-click audio: read the wheel's real on-screen angle every frame and tick
  // each time a segment boundary passes the pointer, so the clicks follow the
  // CSS deceleration exactly (fast and high at first, slow and low at the end).
  const wheelRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!spinning) return
    const el = wheelRef.current
    if (!el) return
    const readAngle = () => {
      const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/)
      if (!m) return null
      const [a, b] = m[1].split(',').map(Number)
      return (Math.atan2(b, a) * 180) / Math.PI
    }
    const start = readAngle()
    if (start === null) return
    let prev = start
    let total = 0
    let lastIdx = Math.floor((start + SEG / 2) / SEG)
    let lastT = performance.now()
    let lastTick = 0
    let raf = 0
    const frame = (t: number) => {
      const cur = readAngle()
      if (cur !== null) {
        const d = ((cur - prev + 540) % 360) - 180
        total += d
        prev = cur
        const idx = Math.floor((start + total + SEG / 2) / SEG)
        if (idx !== lastIdx) {
          lastIdx = idx
          if (t - lastTick >= 28) {
            const speed = Math.abs(d) / Math.max(1, t - lastT) * 1000
            sfx.wheelTick(Math.min(1, speed / 3000))
            lastTick = t
          }
        }
        lastT = t
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [spinning])

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
      // Bank the skin the moment the wheel stops. The spin is already spent, so
      // closing the popup before tapping Collect must never lose the prize.
      grantCosmetic(gift.id)
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
    const watched = await showRewardedAd()
    setBusy(false)
    if (!watched) {
      setError('Watch the ad for an extra spin.')
      return
    }
    spin(false)
  }

  const claim = async (doubled: boolean) => {
    if (!pending || claimed || busy) return
    // Skins are single-item prizes: never doubled, nothing to pay out. They were
    // already granted when the wheel landed; this just dismisses the reveal.
    if (pending.cosmeticId) {
      grantCosmetic(pending.cosmeticId)
      setClaimed(true)
      setError(null)
      return
    }
    if (doubled) {
      setBusy(true)
      const watched = await showRewardedAd()
      if (!watched) {
        setError('Watch the ad to double the prize.')
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
          <svg ref={wheelRef} viewBox="0 0 200 200" className="h-64 w-64 drop-shadow-[0_10px_30px_rgba(255,122,217,0.35)]" style={{ transform: `rotate(${angle}deg)`, transition: spinning ? 'transform 4.1s cubic-bezier(0.16,1,0.3,1)' : 'none' }}>
            <circle cx="100" cy="100" r="98" fill="#1a0d2e" />
            {PRIZES.map((p, i) => {
              const a0 = (i * SEG - 90 - SEG / 2) * (Math.PI / 180); const a1 = ((i + 1) * SEG - 90 - SEG / 2) * (Math.PI / 180); const r = SLICE_RIM
              const x0 = 100 + r * Math.cos(a0); const y0 = 100 + r * Math.sin(a0); const x1 = 100 + r * Math.cos(a1); const y1 = 100 + r * Math.sin(a1)
              const mid = (i * SEG - 90) * (Math.PI / 180)
              const laid = layoutSliceText(p.label)
              const tx = 100 + laid.radius * Math.cos(mid); const ty = 100 + laid.radius * Math.sin(mid)
              const block = laid.lineGap * (laid.lines.length - 1)
              return (
                <g key={p.id}>
                  <path d={`M100 100 L${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1} Z`} fill={p.color} stroke="#1a0d2e" strokeWidth="1.5" />
                  <text fill={p.id === 'again' ? '#fff' : '#1a0d2e'} fontSize={laid.fontSize} fontWeight="700" fontFamily="sans-serif" textAnchor="middle" dominantBaseline="central" transform={`rotate(${i * SEG} ${tx} ${ty})`}>
                    {laid.lines.map((line, li) => (
                      <tspan key={li} x={tx} y={ty - block / 2 + li * laid.lineGap}>{line}</tspan>
                    ))}
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
              <button type="button" disabled={busy} onClick={() => { void claim(false) }} className="w-full rounded-full bg-[#6ee7a8] py-3 text-xl font-bold uppercase text-[#1a0d2e] disabled:opacity-40">{pending.cosmeticId ? 'Collect' : 'Claim'}</button>
              {!pending.cosmeticId && (
                <button type="button" disabled={busy} onClick={() => { void claim(true) }} className="w-full rounded-full bg-[#ffd24d] py-3 text-xl font-bold uppercase text-[#1a0d2e] disabled:opacity-40">{busy ? 'Please wait…' : 'Double Prize (2 Ads)'}</button>
              )}
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

        {/* Skin reveal: same card the chest unboxing uses, with a live preview. */}
        {pending?.cosmeticId && !claimed && !spinning && (() => {
          const item = cosmeticById(pending.cosmeticId)
          if (!item) return null
          const rar = COSMETIC_RARITY[item.rarity]
          return (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0a0510]/95 p-6 backdrop-blur-xl">
              <p className="font-display text-[11px] font-black uppercase tracking-[0.35em] text-[#ffb8ec]">🎡 Lucky Wheel</p>
              <h3 className="font-display mb-4 mt-1 text-2xl font-black text-white">New skin unlocked!</h3>
              <div className="mythic-reveal relative w-full max-w-xs overflow-hidden rounded-[32px] border-2 bg-[#2a1c42] p-5 text-center" style={{ borderColor: rar.color, boxShadow: `0 0 44px ${rar.glow}` }}>
                <span className="inline-block rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider" style={{ color: rar.color, background: `${rar.color}22` }}>New!</span>
                <div className="relative mx-auto my-3 h-32 w-32">
                  {/* Wear it on the player's own character when it fits; otherwise show the item itself. */}
                  {isAccessoryCompatibleById(selected, item.id)
                    ? <CharacterView charId={selected} equippedOverride={{ ...(equipped[selected] ?? {}), [item.slot]: item.id }} className="h-32 w-32 drop-shadow-xl" />
                    : <AccessoryArt id={item.id} className="h-32 w-32 drop-shadow-xl" />}
                </div>
                <h4 className="truncate text-base font-black text-white">{item.name}</h4>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: rar.color }}>{item.rarity} · {TYPE_LABEL[item.type]}</p>
                <p className="mt-3 text-sm font-black text-[#6ee7a8]">✨ Added to your inventory</p>
              </div>
              <button type="button" onClick={() => { void claim(false) }} className="mt-5 w-full max-w-xs rounded-full bg-[#6ee7a8] py-3 text-xl font-bold uppercase text-[#1a0d2e]">Collect</button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
