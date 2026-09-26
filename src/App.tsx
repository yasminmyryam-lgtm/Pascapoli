import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import Peer from 'peerjs'
import Auth from './Auth'
import { CHARACTERS, type Rarity } from './characters'
import { CharacterView } from './cosmetics'
import { OBSTACLES } from './obstacles'
import Game from './Game'
import LuckyWheel from './LuckyWheel'
import DailyHub from './DailyHub'
import ChatModal from './ChatModal'
import Customize from './Customize'
import ErrorBoundary from './ErrorBoundary'
import { levelInfo, useActions, useGameState, spinRemaining, setActiveSession, getDiamonds } from './store'
import { isMuted, toggleMuted } from './sfx'
import { guestApplyLaunch, guestApplyServerAck, type CoopConfig } from './coopConfig'
import { useSession } from './auth/useSession'
import { logout as signOut } from './auth/authService'
import { toAuthError } from './auth/errors'
import { useIsRecoveringPassword } from './auth/recoveryState'
import { disableGuestPlay, useGuestPlay } from './auth/guestPlay'
import { useProfile } from './profile/useProfile'
import { CREDENTIAL_RULES } from './lib/validation'
import { claimRelayRewards, syncWallet } from './economy/economyApi'
import { captureRelay, clearPendingRelay, relayBlocks, type RelayRun } from './relay'

export type { CoopConfig }

// three.js is large, so the 3D engine is only downloaded the first time a
// player starts a 3D run; 2D-only players never pay for it.
const Game3D = lazy(() => import('./three/Game3D'))

type ViewMode = '2D' | '3D'
const VIEW_MODE_KEY = 'pastapoli.viewMode'

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === '3D' ? '3D' : '2D'
  } catch {
    return '2D'
  }
}

// WebRTC ICE config — STUN alone fails behind symmetric/mobile NATs, so we add a
// public TURN relay. This is what makes co-op connect across two different devices.
const PEER_OPTS = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ],
  },
}

const RARITY_PALETTE: Record<Rarity, { hex: string; name: string }> = {
  FREE: { hex: '#6ee7a8', name: 'Free' }, COMMON: { hex: '#8ec5ff', name: 'Common' }, RARE: { hex: '#b98bff', name: 'Rare' }, EPIC: { hex: '#ff7ad9', name: 'Epic' }, LEGENDARY: { hex: '#ffd24d', name: 'Legendary' }, MYTHIC: { hex: '#ff5fa8', name: 'Mythic' }
}

const CHAR_FILTERS: Array<'ALL' | Rarity> = ['ALL', 'FREE', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']

function HScroll({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const scrollByDir = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollByDir(-1)}
        className="hidden lg:flex absolute left-0 top-1/2 z-10 h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#170d24]/90 text-2xl font-black text-white shadow-lg backdrop-blur-sm hover:bg-[#2a1c42]"
      >
        ‹
      </button>
      <div
        ref={scrollerRef}
        className={`flex overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
        style={{ touchAction: 'pan-x', WebkitOverflowScrolling: 'touch' }}
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollByDir(1)}
        className="hidden lg:flex absolute right-0 top-1/2 z-10 h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#170d24]/90 text-2xl font-black text-white shadow-lg backdrop-blur-sm hover:bg-[#2a1c42]"
      >
        ›
      </button>
    </div>
  )
}

export default function App() {
  const { status: sessionStatus, userId, email, username } = useSession()
  const isRecoveringPassword = useIsRecoveringPassword()
  const isGuestPlay = useGuestPlay()
  // Profile is the source of truth for the display name; the signup metadata
  // username is only a fallback while the row loads.
  const { profile, isLoading: isProfileLoading, error: profileError, rename } = useProfile(userId)

  // Point the local save cache at the signed-in account. Runs before the first
  // paint of the authenticated UI so no other account's balance is ever shown.
  useEffect(() => {
    if (sessionStatus === 'LOADING') return
    setActiveSession(userId, email)
    if (sessionStatus === 'AUTHENTICATED') {
      void (async () => {
        await syncWallet(getDiamonds())
        await claimRelayRewards()
      })()
    }
  }, [sessionStatus, userId, email])

  const gameState = useGameState()
  const { coins, diamonds, xp, owned, selected, obstacle, ownedObstacles, lastSpin, streak, best, totalGames, cards } = gameState
  const { selectCharacter, buyCharacter, selectObstacle, buyObstacle, addCoins } = useActions()
  const lvl = levelInfo(xp)

  const [pendingRelay, setPendingRelay] = useState<RelayRun | null>(() => captureRelay(window.location.search))
  const [activeRelay, setActiveRelay] = useState<RelayRun | null>(null)
  const relayHandled = useRef(false)
  const [activeEngineMode, setActiveEngineMode] = useState<'NORMAL' | 'CHALLENGE' | 'COOP'>('NORMAL')
  const [gameSessionId, setGameSessionId] = useState(Date.now()) 
  const [isGameEngineMounted, setIsGameEngineMounted] = useState(false)
  
  const [showNetworkLobby, setShowNetworkLobby] = useState(false)
  const [networkRole, setNetworkRole] = useState<'HOST' | 'GUEST' | null>(null)
  const [networkCode, setNetworkCode] = useState('')
  const [networkInput, setNetworkInput] = useState('')
  const [networkStatus, setNetworkStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('IDLE')
  const [coopConfig, setCoopConfig] = useState<CoopConfig>({ roomId: '', isHost: true, p1Char: selected, p2Char: selected, frontPlayer: 'P1', gameSeed: 0, hostBg: obstacle })
  
  const [showChallengePopup, setShowChallengePopup] = useState(false)
  const [showWheel, setShowWheel] = useState(false)
  const [showDaily, setShowDaily] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode)

  useEffect(() => {
    try { localStorage.setItem(VIEW_MODE_KEY, viewMode) } catch {}
  }, [viewMode])
  const [muted, setMutedState] = useState(isMuted())
  const [customizeId, setCustomizeId] = useState<string | null>(null)
  const [charFilter, setCharFilter] = useState<'ALL' | Rarity>('ALL')

  const filteredCharacters = useMemo(
    () => (charFilter === 'ALL' ? CHARACTERS : CHARACTERS.filter((c) => c.rarity === charFilter)),
    [charFilter],
  )

  const accountEmail = email ?? 'guest'
  const [logoutError, setLogoutError] = useState('')

  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [usernameDraft, setUsernameDraft] = useState('')
  const displayName = profile?.username ?? username ?? accountEmail

  const startEditingUsername = () => {
    setUsernameDraft(profile?.username ?? username ?? '')
    setIsEditingUsername(true)
  }

  const saveUsername = async () => {
    // Stay in edit mode on failure so the rejected text is still there to fix.
    if (await rename(usernameDraft)) setIsEditingUsername(false)
  }

  const handleLogout = async () => {
    if (dataConnection.current || peerInstance.current) terminateNetworkSession()
    setIsGameEngineMounted(false)
    setLogoutError('')
    disableGuestPlay()
    try {
      await signOut()
      setShowSettings(false)
    } catch (cause) {
      setShowSettings(false)
      setLogoutError(toAuthError(cause).message)
    }
  }

  const peerInstance = useRef<any>(null)
  const dataConnection = useRef<any>(null)

  const wheelReady = spinRemaining(lastSpin) <= 0

  const handleGameLaunch = (mode: 'NORMAL'|'CHALLENGE'|'COOP') => {
    setActiveRelay(null)
    setActiveEngineMode(mode); setGameSessionId(Date.now()); setIsGameEngineMounted(true)
  }

  const canEnterApp = sessionStatus === 'AUTHENTICATED' || isGuestPlay

  // Start the relay only after login or Play as Guest. The saved copy does not
  // depend on the address bar surviving the auth screen.
  useEffect(() => {
    if (!pendingRelay || relayHandled.current || isRecoveringPassword) return
    if (sessionStatus === 'LOADING' || !canEnterApp) return
    if (userId && relayBlocks(pendingRelay, userId)) {
      relayHandled.current = true
      clearPendingRelay()
      setPendingRelay(null)
      window.history.replaceState({}, document.title, '/')
      window.alert('You have already participated in this relay chain! Send it to someone new.')
      return
    }
    const run = pendingRelay
    relayHandled.current = true
    setActiveRelay(run)
    setActiveEngineMode('NORMAL')
    setGameSessionId(Date.now())
    setIsGameEngineMounted(true)
    clearPendingRelay()
    setPendingRelay(null)
    window.history.replaceState({}, document.title, '/')
  }, [pendingRelay, sessionStatus, userId, canEnterApp, isRecoveringPassword])

  // --- REȚEA PEERJS ---
  const initializeHostServer = () => {
    setNetworkStatus('CONNECTING')
    const generatedRoomId = Math.floor(1000 + Math.random() * 9000).toString()
    setNetworkCode(generatedRoomId); setNetworkRole('HOST')
    
    const peer = new Peer(`pastapoli-server-${generatedRoomId}`, PEER_OPTS)
    peer.on('open', () => setNetworkStatus('IDLE'))
    peer.on('error', (err: any) => { console.error('Host peer error:', err); setNetworkStatus('ERROR') })
    peer.on('connection', (conn: any) => {
      dataConnection.current = conn
      conn.on('open', () => { setCoopConfig(prev => ({ ...prev, isHost: true, p1Char: selected })) })
      conn.on('error', (err: any) => { console.error('Host conn error:', err); setNetworkStatus('ERROR') })
      conn.on('data', (packet: any) => {
        if (packet.opCode === 'CLIENT_HANDSHAKE') {
          setCoopConfig(prev => ({ ...prev, p2Char: packet.payload.charId }))
          setNetworkStatus('CONNECTED')
          conn.send({ opCode: 'SERVER_ACK', payload: { charId: selected } })
        }
        if (packet.opCode === 'REPLAY_REQ') setGameSessionId(Date.now())
      })
    })
    peerInstance.current = peer
  }

  const connectToHostServer = () => {
    if(networkInput.length !== 4) return
    setNetworkStatus('CONNECTING')
    const peer = new Peer(PEER_OPTS)
    peer.on('error', (err: any) => { console.error('Guest peer error:', err); setNetworkStatus('ERROR') })
    peer.on('open', () => {
      const conn = peer.connect(`pastapoli-server-${networkInput}`, { reliable: true })
      conn.on('open', () => {
        dataConnection.current = conn
        conn.send({ opCode: 'CLIENT_HANDSHAKE', payload: { charId: selected } })
        setCoopConfig(prev => ({ ...prev, isHost: false, roomId: networkInput, p2Char: selected }))
      })
      conn.on('error', (err: any) => { console.error('Guest conn error:', err); setNetworkStatus('ERROR') })
      conn.on('data', (packet: any) => {
        if (packet.opCode === 'SERVER_ACK') {
          setCoopConfig(prev => guestApplyServerAck(prev, packet.payload.charId, selected, networkInput))
          setNetworkStatus('CONNECTED')
        }
        if (packet.opCode === 'GAME_LAUNCH_SEQUENCE') {
          // Host privilege: adopt the host's background for this match, even if unowned.
          // Do not copy host character into P2 — guest keeps their own selected character.
          setCoopConfig(prev => guestApplyLaunch(prev, packet.payload))
          setShowNetworkLobby(false); handleGameLaunch('COOP')
        }
        if (packet.opCode === 'REPLAY_REQ') setGameSessionId(Date.now())
      })
    })
    peerInstance.current = peer
  }

  const executeCoopLaunch = (front: 'P1' | 'P2') => {
    const seed = Date.now()
    // The host's currently-equipped background is authoritative for both players.
    setCoopConfig(prev => ({ ...prev, frontPlayer: front, gameSeed: seed, hostBg: obstacle }))
    if (dataConnection.current) dataConnection.current.send({ opCode: 'GAME_LAUNCH_SEQUENCE', payload: { frontPlayer: front, seed, hostBg: obstacle, p1Char: selected } })
    setShowNetworkLobby(false); handleGameLaunch('COOP')
  }

  const terminateNetworkSession = () => {
    if (dataConnection.current) dataConnection.current.close()
    if (peerInstance.current) peerInstance.current.destroy()
    dataConnection.current = null; peerInstance.current = null; setNetworkRole(null); setNetworkStatus('IDLE')
  }

  const activeChar = CHARACTERS.find((c) => c.id === selected) ?? CHARACTERS[0]

  // Dynamic header title that reflects the section currently in view.
  const [headerTitle, setHeaderTitle] = useState('Home')
  const charSectionRef = useRef<HTMLElement>(null)
  const themesSectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY + 140
      const themesTop = themesSectionRef.current?.offsetTop ?? Infinity
      const charTop = charSectionRef.current?.offsetTop ?? Infinity
      if (y >= themesTop) setHeaderTitle('Themes')
      else if (y >= charTop) setHeaderTitle('Characters')
      else setHeaderTitle('Home')
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Restoring a persisted session is asynchronous — show a neutral splash
  // instead of flashing the sign-in form at an already-authenticated player.
  if (sessionStatus === 'LOADING') {
    return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#1a0d2e]">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-[#8ec5ff] animate-pulse">Loading…</p>
      </div>
    )
  }

  // A verified recovery code produces a real session, so authentication alone
  // is not enough to enter the game — the new password must be saved first.
  if (isRecoveringPassword) return <Auth />
  if (sessionStatus === 'ANONYMOUS' && !isGuestPlay) return <Auth />

  const closeRelay = () => {
    setIsGameEngineMounted(false)
    setActiveRelay(null)
    setPendingRelay(null)
    clearPendingRelay()
    terminateNetworkSession()
  }

  if (activeRelay || (pendingRelay && canEnterApp && !(userId && relayBlocks(pendingRelay, userId)))) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black">
        {activeRelay ? (
          <ErrorBoundary onClose={closeRelay}>
            <Game key={gameSessionId} mode="NORMAL" coopConfig={coopConfig} connection={null} relay={activeRelay} accountId={userId} onClose={closeRelay} onReplay={closeRelay} />
          </ErrorBoundary>
        ) : (
          <div className="grid h-full place-items-center bg-[#11091c]">
            <p className="text-4xl font-black text-white">Continue the game</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="min-h-screen w-full bg-[#1b1429] font-display pb-32" style={{ background: 'radial-gradient(150% 100% at 50% 0%, #2f1d4a 0%, #11091c 100%)' }}>
      <header className="w-full sticky top-0 z-40 bg-[#1b1429]/80 backdrop-blur-md border-b border-white/5 shadow-md">
        <div className="max-w-7xl mx-auto p-4 flex justify-between items-center">
          <div><h1 className="text-2xl font-black text-white">{headerTitle}</h1></div>
          <div className="flex gap-2 items-center">
            <button onClick={() => setShowWheel(true)} className="relative w-12 h-12 bg-white/5 rounded-full text-xl text-white flex items-center justify-center">
              🎡 {wheelReady && <span className="absolute top-0 right-0 w-3 h-3 bg-[#6ee7a8] rounded-full"></span>}
            </button>
            <div className="bg-[#170d24] px-5 py-3 rounded-full font-black text-[#ffe6a3] flex gap-3">
              <span>🪙 {coins}</span>
              <span className="text-[#8ec5ff]">💎 {diamonds}</span>
              <span className="text-[#ff9f43]" title="Daily streak">🔥 {streak.count}</span>
            </div>
            <button onClick={() => setShowChat(true)} aria-label="Chat" className="w-12 h-12 bg-white/5 rounded-full text-xl text-white flex items-center justify-center">💬</button>
            <button onClick={() => setShowSettings(true)} aria-label="Account & Settings" className="w-12 h-12 bg-white/5 rounded-full text-xl text-white flex items-center justify-center">⚙️</button>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto mt-8 px-4">
        <div className="bg-[#2a1c42] rounded-[48px] p-6 shadow-2xl flex flex-col lg:flex-row items-center gap-10">
          {/* no overflow clip: tall accessories spill out instead of forcing
              the character to be scaled down to fit */}
          <div className="relative w-48 h-48 bg-black/30 rounded-[40px] flex items-center justify-center">
            <CharacterView charId={activeChar.id} className="h-32 w-32 drop-shadow-2xl" />
          </div>

          <div className="text-center lg:text-left flex-1 w-full">
            <h2 className="text-4xl font-black text-white mb-2">{activeChar.name}</h2>
            <div className="flex items-center gap-4 justify-center lg:justify-start mb-4">
              <p className="text-white/50 text-sm font-bold uppercase">Level {lvl.level} • {lvl.into}/{lvl.need} XP</p>
              {streak.count > 0 && <p className="text-[#ff7ad9] text-sm font-bold uppercase">🔥 Streak {streak.count}</p>}
            </div>
            <div className="w-full h-3 bg-black/50 rounded-full mb-10 overflow-hidden"><div className="h-full bg-[#8ec5ff]" style={{ width: `${lvl.pct*100}%` }}></div></div>

            <div className="mb-3 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <span className="text-white/50 text-xs font-black uppercase tracking-wider">View</span>
              <div className="inline-flex rounded-2xl bg-black/40 p-1" role="group" aria-label="Game perspective">
                {(['2D', '3D'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setViewMode(v)}
                    aria-pressed={viewMode === v}
                    className={`rounded-xl px-6 py-2 text-sm font-black uppercase transition-colors ${viewMode === v ? 'bg-[#ffd24d] text-[#170d24]' : 'text-white/60 hover:text-white'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {viewMode === '3D' && <span className="text-white/40 text-[11px] font-bold">First-person · swipe to look</span>}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <button onClick={() => handleGameLaunch('NORMAL')} className="bg-[#6ee7a8] text-[#170d24] py-4 rounded-2xl font-black uppercase">▶ Solo</button>
              <button onClick={() => setCustomizeId(activeChar.id)} className="bg-[#412e61] text-white py-4 rounded-2xl font-black uppercase">👕 Custom</button>
              <button onClick={() => setShowChallengePopup(true)} className="bg-[#ff7ad9] text-[#170d24] py-4 rounded-2xl font-black uppercase">🔥 Hard</button>
              <button onClick={() => { setNetworkRole(null); setCoopConfig(prev => ({ ...prev, p1Char: selected, p2Char: selected })); setShowNetworkLobby(true); }} className="bg-[#8ec5ff] text-[#170d24] py-4 rounded-2xl font-black uppercase">🤝 Co-op</button>
            </div>
          </div>
        </div>
      </section>

      {/* Character collection — main has pb-32 so scrolling works cleanly */}
      <section ref={charSectionRef} className="max-w-7xl mx-auto mt-12 px-4">
        <h2 className="text-2xl font-black text-white mb-4">Characters</h2>
        <div className="flex gap-2 overflow-x-auto mb-5 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {CHAR_FILTERS.map((f) => {
            const on = charFilter === f
            const hex = f === 'ALL' ? '#ffd24d' : RARITY_PALETTE[f].hex
            return (
              <button
                key={f}
                type="button"
                onClick={() => setCharFilter(f)}
                className={`shrink-0 rounded-full px-5 py-2 text-xs font-black uppercase tracking-wider transition-all ${on ? 'text-[#170d24]' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'}`}
                style={on ? { background: hex } : { border: `1px solid ${hex}44` }}
              >
                {f === 'ALL' ? 'All' : RARITY_PALETTE[f].name}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          {filteredCharacters.map((char) => {
            const isOwned = owned.includes(char.id)
            const isSelected = selected === char.id
            const color = RARITY_PALETTE[char.rarity].hex
            // MYTHIC characters can't be bought — they fill up from chest cards.
            const need = char.cardsNeeded ?? 0
            const have = need > 0 ? Math.min(cards[char.id] ?? 0, need) : 0
            return (
              <article key={char.id} className={`rounded-[32px] p-5 transition-all ${isSelected ? 'bg-[#352554] border-2 border-[#6ee7a8]' : 'bg-[#2a1c42] border-2 border-transparent'}`}>
                <div className="flex justify-between items-center mb-2"><span className="text-[9px] font-black uppercase px-2 py-0.5 rounded" style={{ color: color, backgroundColor: `${color}20` }}>{char.rarity}</span></div>
                <div className="flex-1 flex justify-center py-4">
                  <div className="h-20 w-20">
                    <CharacterView charId={char.id} className={`h-20 w-20 ${!isOwned ? 'opacity-20 grayscale' : 'drop-shadow-xl'}`} />
                  </div>
                </div>
                <h3 className="text-white font-bold text-center text-sm mb-4 truncate">{char.name}</h3>
                {isOwned ? (
                  <button onClick={() => selectCharacter(char.id)} className={`w-full py-3 rounded-xl font-black text-[11px] uppercase ${isSelected ? 'bg-[#6ee7a8] text-[#123]' : 'bg-white/10 text-white'}`}>{isSelected ? 'Equipped' : 'Select'}</button>
                ) : need > 0 ? (
                  <div className="w-full rounded-xl bg-[#12081d] border border-white/10 px-3 py-2.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-black/50">
                      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(have / need) * 100}%`, background: color }} />
                    </div>
                    <p className="mt-1.5 text-center text-[10px] font-black uppercase tracking-wider text-white/60">🎁 Cards: {have}/{need}</p>
                  </div>
                ) : (
                  <button onClick={() => buyCharacter(char.id, char.price, char.currency ?? 'COINS')} className="w-full py-3 rounded-xl font-black text-[11px] bg-[#12081d] border border-white/10 text-white">
                    {char.currency === 'DIAMONDS' ? `💎 ${char.price}` : `🪙 ${char.price}`}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section ref={themesSectionRef} className="max-w-7xl mx-auto mt-12 mb-10">
        <h2 className="text-xl font-black text-white mb-4 px-4">Themes</h2>
        <HScroll className="gap-4 pb-6 px-4 lg:px-14">
          {OBSTACLES.map((o) => {
            const on = obstacle === o.id
            const isOwned = (ownedObstacles || []).includes(o.id) || o.id === 'woodo'
            const isDiamond = o.currency === 'DIAMONDS'
            const locked = !isOwned && lvl.level < o.unlockLevel
            const canAfford = isDiamond ? diamonds >= o.price : coins >= o.price
            return (
              <button
                type="button"
                key={o.id}
                disabled={locked}
                onClick={() => {
                  if (isOwned) selectObstacle(o.id)
                  else if (!locked) buyObstacle(o.id, o.price, o.currency)
                }}
                className={`shrink-0 w-64 rounded-[28px] border-4 p-5 flex flex-col justify-end h-40 relative overflow-hidden text-left transition-transform active:scale-95 ${on ? 'border-[#ffd24d]' : 'border-transparent'} ${locked ? 'opacity-70' : ''}`}
                style={{ background: o.backgroundStyle }}
              >
                {o.Background && <div className="absolute inset-0 opacity-40 pointer-events-none z-0"><o.Background /></div>}
                {locked && <div className="absolute inset-0 bg-black/55 z-[5] flex items-center justify-center pointer-events-none"><span className="text-white font-black text-sm">🔒 Level {o.unlockLevel}</span></div>}
                <div className="relative z-10 w-full bg-black/50 backdrop-blur-md p-3 rounded-xl flex justify-between items-center text-white font-bold text-sm pointer-events-none">
                  <span className="truncate">{o.name}</span>
                  {on ? (
                    <span className="text-[#ffd24d] shrink-0">✓ Active</span>
                  ) : isOwned ? (
                    <span className="text-[#6ee7a8] shrink-0">Select</span>
                  ) : (
                    <span className={`shrink-0 ${canAfford ? '' : 'text-[#ff9e9e]'}`}>{isDiamond ? '💎' : '🪙'} {o.price}</span>
                  )}
                </div>
              </button>
            )
          })}
        </HScroll>
      </section>

      {/* LOBBY P2P */}
      {showNetworkLobby && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/90 p-4">
          <button onClick={() => {setShowNetworkLobby(false); terminateNetworkSession()}} className="absolute top-8 right-8 w-14 h-14 bg-white/10 rounded-full text-white text-2xl z-50">✕</button>
          <div className="bg-[#1f1333] p-8 rounded-[48px] w-full max-w-lg shadow-2xl text-center">
            <h2 className="text-4xl font-black text-white mb-8">Multiplayer P2P</h2>
            {!networkRole && (
              <div className="flex flex-col gap-4">
                <button onClick={initializeHostServer} className="bg-[#8ec5ff] py-6 rounded-3xl font-black text-xl text-[#123]">Create Room (Host)</button>
                <button onClick={() => { setNetworkRole('GUEST'); setCoopConfig(prev => ({ ...prev, isHost: false, p2Char: selected })); }} className="bg-[#6ee7a8] py-6 rounded-3xl font-black text-xl text-[#123]">Join with Code (Guest)</button>
              </div>
            )}
            {networkRole === 'HOST' && (
              <div>
                <p className="text-[#8ec5ff] mb-2 font-bold uppercase">Your Room Code</p>
                <div className="bg-black/50 py-6 rounded-3xl mb-6"><p className="text-6xl font-black text-[#8ec5ff]">{networkCode}</p></div>
                {networkStatus === 'CONNECTED' ? (
                  <div className="flex flex-col gap-4 bg-[#8ec5ff]/10 p-6 rounded-3xl">
                    <button onClick={() => executeCoopLaunch('P1')} className="bg-[#ffd24d] py-4 rounded-xl font-bold text-[#123]">I play in front</button>
                    <button onClick={() => executeCoopLaunch('P2')} className="bg-white/10 text-white py-4 rounded-xl font-bold">Friend plays in front</button>
                  </div>
                ) : networkStatus === 'ERROR' ? (
                  <p className="text-[#ff7a7a] font-bold">Network error. Close and try again.</p>
                ) : <p className="text-white animate-pulse">Waiting for Player 2...</p>}
              </div>
            )}
            {networkRole === 'GUEST' && (
              <div className="flex flex-col gap-4">
                <input type="number" value={networkInput} onChange={(e)=>setNetworkInput(e.target.value.slice(0,4))} placeholder="0000" className="text-center text-6xl font-black py-6 rounded-3xl bg-black/40 text-white outline-none" maxLength={4} />
                {networkStatus === 'CONNECTED' ? (
                  <p className="text-[#6ee7a8] font-black animate-pulse">Connected! Waiting for host...</p>
                ) : networkStatus === 'ERROR' ? (
                  <p className="text-[#ff7a7a] font-bold">Connection failed. Check the code and try again.</p>
                ) : networkStatus === 'CONNECTING' ? (
                  <p className="text-white/70 font-bold animate-pulse">Connecting...</p>
                ) : null}
                <button onClick={connectToHostServer} disabled={networkInput.length !== 4 || networkStatus === 'CONNECTING'} className="mt-2 bg-[#6ee7a8] py-6 rounded-3xl font-black text-xl text-[#123] disabled:opacity-40">Connect</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HARD MODE (Taxare o singură dată) */}
      {showChallengePopup && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#2a1c42] p-8 rounded-[40px] w-full max-w-sm text-center">
            <h3 className="text-3xl font-black text-white mb-2">Hard Mode</h3>
            <p className="text-white/60 mb-6 text-sm font-bold">Coins x10. Unpredictable obstacles.</p>
            <div className="mb-6 font-black text-[#ffe6a3] text-xl bg-black/40 py-4 rounded-3xl">ENTRY FEE: 100 🪙</div>
            <button onClick={() => { if (coins >= 100) { addCoins(-100); setShowChallengePopup(false); handleGameLaunch('CHALLENGE'); } }} disabled={coins < 100} className={`w-full py-5 rounded-2xl font-black uppercase text-lg ${coins >= 100 ? 'bg-[#ff7ad9] text-[#170d24]' : 'bg-white/10 text-white/30'}`}>Enter Arena</button>
            <button onClick={() => setShowChallengePopup(false)} className="w-full mt-6 text-white/40 font-bold uppercase">Cancel</button>
          </div>
        </div>
      )}

      {/* MOTOR JOC (Remounting cu Key pentru Replay perfect curat) */}
      {isGameEngineMounted && (
        <div className="fixed inset-0 z-[1000] bg-black">
           <ErrorBoundary onClose={() => { setIsGameEngineMounted(false); terminateNetworkSession(); }}>
             {viewMode === '3D' && !activeRelay ? (
               <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-black"><p className="text-2xl font-black text-white animate-pulse">Loading 3D…</p></div>}>
                 <Game3D
                   key={gameSessionId}
                   mode={activeEngineMode}
                   coopConfig={coopConfig}
                   connection={dataConnection.current}
                   onClose={() => { setIsGameEngineMounted(false); terminateNetworkSession(); }}
                   onReplay={() => { if (activeEngineMode === 'COOP' && dataConnection.current) { dataConnection.current.send({ opCode: 'REPLAY_REQ' }) }; setGameSessionId(Date.now()) }}
                 />
               </Suspense>
             ) : (
             <Game key={gameSessionId} mode={activeEngineMode} coopConfig={coopConfig} connection={dataConnection.current} relay={activeRelay} accountId={userId} onClose={() => { setIsGameEngineMounted(false); setActiveRelay(null); terminateNetworkSession(); }} onReplay={() => { if(activeEngineMode==='COOP' && dataConnection.current){dataConnection.current.send({opCode:'REPLAY_REQ'})}; setGameSessionId(Date.now()) }} />
             )}
           </ErrorBoundary>
        </div>
      )}
      
      {/* CONT & SETĂRI */}
      {showSettings && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="relative max-h-[90vh] w-full max-w-[400px] overflow-y-auto rounded-[32px] border border-white/10 bg-[#1f1333] p-6" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <button onClick={() => setShowSettings(false)} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white">✕</button>
            <p className="font-display text-[11px] uppercase tracking-[0.35em] text-[#8ec5ff]">My Account</p>
            <h2 className="font-display text-3xl font-black text-white mb-5">Settings</h2>

            <div className="rounded-3xl bg-black/30 p-4 mb-4">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#8ec5ff]/20 text-2xl">👤</div>

                {isEditingUsername && !isGuestPlay ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <input
                      type="text"
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      minLength={CREDENTIAL_RULES.usernameMinLength}
                      maxLength={CREDENTIAL_RULES.usernameMaxLength}
                      autoFocus
                      className="w-full rounded-xl bg-black/40 px-3 py-2 font-bold text-white outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => void saveUsername()}
                        disabled={isProfileLoading}
                        className="rounded-xl bg-[#6ee7a8] px-4 py-2 text-xs font-black uppercase text-[#123] disabled:opacity-50"
                      >
                        {isProfileLoading ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setIsEditingUsername(false)}
                        className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black uppercase text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-white/40 text-[10px] font-black uppercase tracking-wider">Signed in as</p>
                      <p className="truncate font-bold text-white">{displayName}</p>
                      <p className="truncate text-[11px] font-bold text-white/40">{accountEmail}</p>
                    </div>
                    {!isGuestPlay && (
                    <button
                      onClick={startEditingUsername}
                      aria-label="Edit username"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm"
                    >
                      ✏️
                    </button>
                    )}
                  </div>
                )}
              </div>

              {profileError && <p className="mt-3 text-xs font-bold text-[#ff4d4d]">{profileError}</p>}
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="rounded-2xl bg-black/30 p-3 text-center">
                <p className="text-2xl font-black text-[#ffd24d]">{best}</p>
                <p className="text-[10px] font-black uppercase text-white/40">Best</p>
              </div>
              <div className="rounded-2xl bg-black/30 p-3 text-center">
                <p className="text-2xl font-black text-[#6ee7a8]">{lvl.level}</p>
                <p className="text-[10px] font-black uppercase text-white/40">Level</p>
              </div>
              <div className="rounded-2xl bg-black/30 p-3 text-center">
                <p className="text-2xl font-black text-[#ff7ad9]">{totalGames}</p>
                <p className="text-[10px] font-black uppercase text-white/40">Games</p>
              </div>
              <div className="rounded-2xl bg-black/30 p-3 text-center">
                <p className="text-2xl font-black text-[#ff9f43]">🔥{streak.count}</p>
                <p className="text-[10px] font-black uppercase text-white/40">Streak</p>
              </div>
            </div>

            <button onClick={() => setMutedState(toggleMuted())} className="mb-3 flex w-full items-center justify-between rounded-2xl bg-black/30 p-4 text-white">
              <span className="font-bold">{muted ? '🔇 Sound' : '🔊 Sound'}</span>
              <span className={`grid h-7 w-12 items-center rounded-full px-1 transition-colors ${muted ? 'bg-white/15' : 'bg-[#6ee7a8]'}`}>
                <span className={`h-5 w-5 rounded-full bg-white transition-transform ${muted ? '' : 'translate-x-5'}`} />
              </span>
            </button>

            {/* Friends — layout only. Controls are disabled so they read as
                "not built yet" rather than broken. */}
            <div className="mb-3 rounded-2xl bg-black/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold text-white">👥 Friends</p>
                <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-black uppercase text-white/50">Soon</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled
                  placeholder="Search players…"
                  className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none disabled:opacity-60"
                />
                <button
                  disabled
                  className="rounded-xl bg-[#8ec5ff] px-4 py-2.5 text-xs font-black uppercase text-[#123] disabled:opacity-40"
                >
                  Search
                </button>
              </div>
            </div>

            {logoutError && <p className="mb-3 text-center text-xs font-bold text-[#ff4d4d]">{logoutError}</p>}
            {isGuestPlay ? (
              <div>
                <p className="mb-3 text-center text-sm font-bold text-[#8ec5ff]">Log in to save your score and progress!</p>
                <button
                  onClick={() => { setIsEditingUsername(false); setShowSettings(false); disableGuestPlay() }}
                  className="w-full rounded-2xl bg-[#6ee7a8] py-4 font-black uppercase text-[#170d24]"
                >
                  Log In / Create Account
                </button>
              </div>
            ) : (
              <button onClick={() => void handleLogout()} className="w-full rounded-2xl bg-[#ff6b6b] py-4 font-black uppercase text-white">Log Out</button>
            )}
          </div>
        </div>
      )}

      {/* Componentele Z-Index Mare */}
      {showWheel && <div className="fixed inset-0 z-[9999]"><LuckyWheel onClose={() => setShowWheel(false)} /></div>}
      {showDaily && <div className="fixed inset-0 z-[9999]"><DailyHub onClose={() => setShowDaily(false)} /></div>}
      {showChat && <div className="fixed inset-0 z-[9999]"><ChatModal onClose={() => setShowChat(false)} /></div>}
      {customizeId && (
        <div className="fixed inset-0 z-[9999]">
          <ErrorBoundary onClose={() => setCustomizeId(null)}>
            <Customize charId={customizeId} onClose={() => setCustomizeId(null)} />
          </ErrorBoundary>
        </div>
      )}
    </main>
  )
}