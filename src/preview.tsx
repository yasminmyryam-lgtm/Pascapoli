import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { CHARACTERS } from './characters'
import { ACCESSORY_POOL, AccessoryArt, CharacterComposite, cosmeticById } from './cosmetics'

/** Temporary QC harness. Not part of the app bundle; delete after review. */

const POOL = ACCESSORY_POOL.map((id) => cosmeticById(id)!).filter(Boolean)

/** One representative of each silhouette class the brief calls out. */
const SILHOUETTES = [
  ['mozzarella', 'mozzarella'],
  ['espressino', 'macchiato'],
  ['panino', 'panino'],
  ['limone', 'limoncello'],
  ['pizzarino', 'pizzetta'],
  ['spaghetto', 'spaghetto'],
] as const

type Row = { id: string; ok: boolean; bare: string; worn: string[] }

/**
 * The core invariant: the `#character-base` bounding box and the svg viewBox
 * must be byte-identical with and without every accessory equipped.
 */
function measure(): Row[] {
  const rows: Row[] = []
  for (const char of CHARACTERS) {
    const bareEl = document.querySelector<SVGSVGElement>(`[data-probe="${char.id}-bare"] > svg`)
    if (!bareEl) continue
    const base = bareEl.querySelector<SVGGElement>('#character-base')
    if (!base) continue
    const b = base.getBBox()
    const bare = `${bareEl.getAttribute('viewBox')} | ${b.x.toFixed(2)},${b.y.toFixed(2)},${b.width.toFixed(2)},${b.height.toFixed(2)}`
    const worn: string[] = []
    for (const acc of POOL) {
      const el = document.querySelector<SVGSVGElement>(`[data-probe="${char.id}-${acc.id}"] > svg`)
      const g = el?.querySelector<SVGGElement>('#character-base')
      if (!el || !g) continue
      const r = g.getBBox()
      worn.push(`${el.getAttribute('viewBox')} | ${r.x.toFixed(2)},${r.y.toFixed(2)},${r.width.toFixed(2)},${r.height.toFixed(2)}`)
    }
    rows.push({ id: char.id, ok: worn.every((w) => w === bare), bare, worn })
  }
  return rows
}

function Probes() {
  return (
    <div style={{ position: 'absolute', left: -99999, top: 0 }} aria-hidden>
      {CHARACTERS.map((c) => (
        <React.Fragment key={c.id}>
          <div data-probe={`${c.id}-bare`}>
            <CharacterComposite charId={c.id} equipped={{}} style={{ width: 120, height: 132 }} />
          </div>
          {POOL.map((a) => (
            <div key={a.id} data-probe={`${c.id}-${a.id}`}>
              <CharacterComposite charId={c.id} equipped={{ [a.slot]: a.id }} style={{ width: 120, height: 132 }} />
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  )
}

function App() {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    const t = window.setTimeout(() => setRows(measure()), 400)
    return () => window.clearTimeout(t)
  }, [])

  const failing = rows.filter((r) => !r.ok)

  return (
    <div style={{ background: '#140c22', color: '#fff', fontFamily: 'system-ui', padding: 24 }}>
      <Probes />

      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Size-invariance check</h1>
      <p style={{ fontSize: 14, opacity: 0.7 }}>
        {rows.length === 0
          ? 'measuring…'
          : failing.length === 0
            ? `PASS — #character-base bbox + viewBox identical across ${rows.length} characters × ${POOL.length} accessories (${rows.length * POOL.length} combinations).`
            : `FAIL — ${failing.length} character(s) changed size: ${failing.map((f) => f.id).join(', ')}`}
      </p>
      {failing.slice(0, 4).map((f) => (
        <pre key={f.id} style={{ fontSize: 11, color: '#ff8a8a' }}>{f.id}\n  bare: {f.bare}\n  worn: {f.worn.join('\n        ')}</pre>
      ))}

      <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 28 }}>Roster ({CHARACTERS.length})</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {CHARACTERS.map((c) => (
          <div key={c.id} style={{ background: '#241636', borderRadius: 14, padding: 8, textAlign: 'center' }}>
            <CharacterComposite charId={c.id} equipped={{}} style={{ width: '100%', height: 210 }} />
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{c.name}</div>
          </div>
        ))}
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 28 }}>Accessory product shots</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
        {POOL.map((a) => (
          <div key={a.id} style={{ background: '#241636', borderRadius: 14, padding: 8, textAlign: 'center' }}>
            <AccessoryArt id={a.id} style={{ width: '100%', height: 110 }} />
            <div style={{ fontSize: 9, opacity: 0.75 }}>{a.name}</div>
            <div style={{ fontSize: 8, opacity: 0.5 }}>{a.rarity} · {a.type}</div>
          </div>
        ))}
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 28 }}>Anchor fit matrix</h1>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th />
            <th style={{ fontSize: 10, opacity: 0.6 }}>none</th>
            {POOL.map((a) => (
              <th key={a.id} style={{ fontSize: 10, opacity: 0.6, width: 104 }}>{a.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SILHOUETTES.map(([id, label]) => (
            <tr key={id}>
              <td style={{ fontSize: 10, opacity: 0.7, paddingRight: 8 }}>{label}</td>
              <td style={{ background: '#1d1230' }}>
                <CharacterComposite charId={id} equipped={{}} style={{ width: 100, height: 112 }} />
              </td>
              {POOL.map((a) => (
                <td key={a.id} style={{ background: '#241636' }}>
                  <CharacterComposite charId={id} equipped={{ [a.slot]: a.id }} style={{ width: 100, height: 112 }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
