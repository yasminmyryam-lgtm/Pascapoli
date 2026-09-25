import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import type { CoopConfig } from './coopConfig'
import Game3D from './three/Game3D'

const QC_COOP: CoopConfig = {
  roomId: '',
  isHost: true,
  p1Char: 'mozzarella',
  p2Char: 'mozzarella',
  frontPlayer: 'P1',
  gameSeed: 12345,
  hostBg: '',
}

/** QC harness. Mounts the real 3D match — does not touch 2D Game.tsx. */
function Harness() {
  return (
    <Game3D
      mode="NORMAL"
      coopConfig={QC_COOP}
      connection={null}
      onClose={() => {}}
      onReplay={() => window.location.reload()}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)
