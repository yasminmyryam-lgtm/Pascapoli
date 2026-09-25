import { useMemo, useState } from 'react'
import { CHARACTERS } from './characters'
import {
  AccessoryArt,
  CharacterView,
  COSMETIC_RARITY,
  SLOT_LABEL,
  TYPE_LABEL,
  useAccessoryInventory,
  type Slot,
} from './cosmetics'
import { useActions, useGameState } from './store'

const SLOT_ORDER: Slot[] = ['hat', 'glasses', 'face', 'wig', 'outfit', 'accessory', 'shoes', 'wings', 'aura']

function Coin({ size = 18 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#f5a623"/><circle cx="12" cy="12" r="8.5" fill="#ffcf4d"/></svg> }

export default function Customize({ charId, onClose }: { charId: string, onClose: () => void }) {
  const { coins, equipped } = useGameState()
  const { buyCosmetic, equipCosmetic, unequipCosmetic } = useActions()

  const char = CHARACTERS.find((c) => c.id === charId) ?? CHARACTERS[0]
  const eq = equipped[charId] || {}

  // Real inventory objects: the catalogue resolved against the player's save.
  const inventory = useAccessoryInventory(char.id)

  const [filter, setFilter] = useState<'ALL' | Slot>('ALL')
  const items = useMemo(
    () => (filter === 'ALL' ? inventory : inventory.filter((c) => c.slot === filter)),
    [filter, inventory],
  )

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-md md:items-center md:justify-center p-0 md:p-8 font-display" onClick={onClose}>
      <div className="relative flex flex-col w-full h-[85vh] md:max-w-5xl bg-[#1a0d2e] rounded-t-[40px] md:rounded-[40px] shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-6 right-6 z-20 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white font-bold hover:bg-white/20 text-xl backdrop-blur-sm">✕</button>

        <div className="p-8 pb-4 shrink-0 flex items-center gap-6 relative z-10 border-b border-white/5">
          {/* no overflow clip so tall accessories spill instead of rescaling */}
          <div className="w-24 h-24 shrink-0 bg-white/5 rounded-[24px] flex items-center justify-center">
            <CharacterView charId={char.id} equippedOverride={eq} className="h-16 w-16 drop-shadow-lg" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">{char.name}</h2>
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl text-[#ffe6a3] font-bold"><Coin size={16}/> {coins}</div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto px-8 py-4 shrink-0 scrollbar-hide border-b border-white/5 bg-black/20">
          {(['ALL', ...SLOT_ORDER] as const).map((s) => {
            const on = filter === s
            return (
              <button key={s} onClick={() => setFilter(s)} className={`shrink-0 rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${on ? 'bg-[#ffd24d] text-[#1a0d2e]' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}>
                {s === 'ALL' ? 'All' : SLOT_LABEL[s]}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((c) => {
              const meta = COSMETIC_RARITY[c.rarity]

              return (
                <article key={c.id} className="relative flex flex-col bg-white/5 rounded-[28px] border-2 h-60 overflow-visible transition-all" style={{ borderColor: c.equipped ? meta.color : 'transparent' }}>
                  <div className="absolute top-3 w-full px-3 flex justify-between items-center z-10">
                    <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest" style={{ background: meta.color, color: '#1a0d2e' }}>{c.rarity}</span>
                    <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-black/40 text-white/60">{TYPE_LABEL[c.type]}</span>
                  </div>
                  <div className="flex-1 flex justify-center items-center relative mt-4">
                    <div className="absolute w-20 h-20 rounded-full blur-[30px] opacity-20" style={{ background: meta.color }}></div>
                    {/* worn on the actual character, so the anchor fit is visible before buying */}
                    <CharacterView charId={char.id} equippedOverride={{ [c.slot]: c.id }} className="h-20 w-20 drop-shadow-xl relative z-10" />
                    {c.unlocked && (
                      <AccessoryArt id={c.id} className="absolute bottom-0 right-1 h-8 w-8 opacity-60" />
                    )}
                  </div>
                  <div className="p-4 bg-black/40 shrink-0">
                    <h3 className="text-white font-bold text-center text-xs mb-3 truncate w-full">{c.name}</h3>
                    {!c.unlocked ? (
                      <button
                        onClick={() => { if (buyCosmetic(c.id, c.price) === 'bought') equipCosmetic(char.id, c.slot, c.id) }}
                        className="w-full py-2.5 rounded-xl text-[10px] font-bold uppercase flex items-center justify-center gap-1.5"
                        style={{ background: meta.color, color: '#1a0d2e' }}
                      >
                        <Coin size={12}/> {c.price}
                      </button>
                    ) : c.equipped ? (
                      <button
                        onClick={() => unequipCosmetic(char.id, c.slot)}
                        className="w-full py-2.5 rounded-xl text-[10px] font-bold uppercase"
                        style={{ background: 'rgba(255,255,255,0.1)', color: meta.color }}
                      >
                        Equipped ✓ · Unequip
                      </button>
                    ) : (
                      <button
                        onClick={() => equipCosmetic(char.id, c.slot, c.id)}
                        className="w-full py-2.5 rounded-xl text-[10px] font-bold uppercase"
                        style={{ background: meta.color, color: '#1a0d2e' }}
                      >
                        Owned · Equip
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
