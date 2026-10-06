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
import { decodeCoopPacket, guestApplyLaunch, guestApplyServerAck, normalizeRoomCode, type CoopConfig } from './coopConfig'
import { useSession } from './auth/useSession'
import { logout as signOut } from './auth/authService'
import { toAuthError } from './auth/errors'
import { useIsRecoveringPassword } from './auth/recoveryState'
import { disableGuestPlay, useGuestPlay } from './auth/guestPlay'
import { useProfile } from './profile/useProfile'
import { CREDENTIAL_RULES } from './lib/validation'
import { claimRelayRewards, syncWallet } from './economy/economyApi'
import { notifyShellReady } from './ads/adService'
import { captureRelay, clearPendingRelay, loadPendingRelay, relayBlocks, urlHasAuthCallback, type RelayRun } from './relay'
import { useI18n } from './i18n/I18n'
import LanguageMenu from './i18n/LanguageMenu'
import { rarityMessageKey } from './i18n/rarity'

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

/** Phones, Android tablets, iPads, and iPadOS desktop-mode. A mouse-driven laptop stays false. */
function isHandheldDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true
  if (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)) return true
  return window.matchMedia('(pointer: coarse)').matches
}

const CONNECT_TIMEOUT_MS = 12000

// Public Google STUN only. Extra TURN relays were stalling the handshake.
const PEER_OPTS = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
}

function roomPeerId(code: string): string {
  return `pastapoli-server-${normalizeRoomCode(code)}`
}

function peerErrorMessage(err: { type?: string }, role: 'HOST' | 'GUEST'): string {
  switch (err?.type) {
    case 'peer-unavailable':
      return 'No room with that code. Check it and try again.'
    case 'unavailable-id':
      return 'That room is already open. Close and create a new one.'
    case 'invalid-id':
      return 'That room code is not valid.'
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
    case 'disconnected':
      return 'Could not reach the multiplayer server. Check your connection and try again.'
    case 'webrtc':
      return 'The two devices could not open a connection. Try again.'
    case 'browser-incompatible':
      return 'This browser cannot start a multiplayer room.'
    default:
      return role === 'HOST'
        ? 'Could not create the room. Close and try again.'
        : 'Connection failed. Check the code and try again.'
  }
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
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) return
      el.scrollLeft += e.deltaX
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const scrollByDir = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' })
  }

  return (
    <div className="relative w-full min-w-0">
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
        className={`flex w-full min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
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
  const { t } = useI18n()
  const { status: sessionStatus, userId, email, username } = useSession()
  const isRecoveringPassword = useIsRecoveringPassword()
  const isGuestPlay = useGuestPlay()
  // Profile is the source of truth for the display name; the signup metadata
  // username is only a fallback while the row loads.
  const { profile, isLoading: isProfileLoading, error: profileError, rename } = useProfile(userId)

  // Point the local save cache at the signed-in account. Runs before the first
  // paint of the authenticated UI so no other account's balance is ever shown.
  useEffect(() => {
    if (sessionStatus !== 'LOADING') notifyShellReady()
  }, [sessionStatus])

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

  const [pendingRelay, setPendingRelay] = useState<RelayRun | null>(() =>
    captureRelay(window.location.search, window.location.hash),
  )

  // A login or recovery redirect keeps its code until Supabase stores the
  // session. The saved relay is picked up on the next render, once that
  // code is gone, so the handoff does not erase it.
  useEffect(() => {
    if (pendingRelay) return
    if (urlHasAuthCallback(window.location.search, window.location.hash)) return
    const params = new URLSearchParams(window.location.search)
    if (['room', 'roomId', 'coop', 'peer'].some((key) => params.has(key))) return
    const saved = loadPendingRelay()
    if (saved) setPendingRelay(saved)
  }, [pendingRelay, sessionStatus])
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
  const [networkMessage, setNetworkMessage] = useState('')
  const [sameDeviceCoop, setSameDeviceCoop] = useState(() => !isHandheldDevice())
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const apply = () => setSameDeviceCoop(!isHandheldDevice())
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
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
  const [liveConnection, setLiveConnection] = useState<any>(null)

  const wheelReady = spinRemaining(lastSpin) <= 0

  const attachConnection = (conn: any) => {
    dataConnection.current = conn
    setLiveConnection(conn)
  }

  const handleGameLaunch = (mode: 'NORMAL'|'CHALLENGE'|'COOP') => {
    if (mode === 'COOP') {
      relayHandled.current = true
      clearPendingRelay()
      setPendingRelay(null)
    }
    setActiveRelay(null)
    setActiveEngineMode(mode); setGameSessionId(Date.now()); setIsGameEngineMounted(true)
  }

  const canEnterApp = sessionStatus === 'AUTHENTICATED' || isGuestPlay

  // Start the relay only after login or Play as Guest. The saved copy does not
  // depend on the address bar surviving the auth screen.
  useEffect(() => {
    if (!pendingRelay || relayHandled.current || isRecoveringPassword) return
    if (sessionStatus === 'LOADING' || !canEnterApp) return
    // An open lobby or a live peer must keep running. Relay never takes that socket.
    if (showNetworkLobby || activeEngineMode === 'COOP' || networkRole || dataConnection.current) return
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
  }, [pendingRelay, sessionStatus, userId, canEnterApp, isRecoveringPassword, showNetworkLobby, activeEngineMode, networkRole])

  const destroyPeer = () => {
    try { dataConnection.current?.close() } catch {}
    try { peerInstance.current?.destroy() } catch {}
    dataConnection.current = null
    peerInstance.current = null
    setLiveConnection(null)
  }

  const failNetwork = (message: string) => {
    console.error('Co-op:', message)
    setNetworkMessage(message)
    setNetworkStatus('ERROR')
  }

  const watchConnection = (conn: any, role: 'HOST' | 'GUEST') => {
    conn.on('error', (err: { type?: string }) => {
      console.error(`${role} conn error:`, err)
      failNetwork(peerErrorMessage(err, role))
    })
    conn.on('close', () => {
      if (dataConnection.current !== conn) return
      dataConnection.current = null
      setLiveConnection(null)
      failNetwork('The other player left the room.')
    })
    conn.on('iceStateChanged', (state: string) => {
      if (state === 'failed') failNetwork('The two devices could not connect. Try again.')
    })
  }

  // --- REȚEA PEERJS ---
  const initializeHostServer = () => {
    destroyPeer()
    setNetworkMessage('')
    setNetworkStatus('CONNECTING')
    const generatedRoomId = normalizeRoomCode(String(Math.floor(1000 + Math.random() * 9000)))
    setNetworkCode(generatedRoomId)
    setNetworkRole('HOST')

    const peer = new Peer(roomPeerId(generatedRoomId), PEER_OPTS)
    let opened = false
    const timer = window.setTimeout(() => {
      if (opened) return
      failNetwork('The room took too long to open. Close and try again.')
      try { peer.destroy() } catch {}
    }, CONNECT_TIMEOUT_MS)
    peer.on('open', () => {
      opened = true
      window.clearTimeout(timer)
      setNetworkMessage('')
      setNetworkStatus('IDLE')
    })
    peer.on('error', (err: { type?: string }) => {
      window.clearTimeout(timer)
      console.error('Host peer error:', err)
      failNetwork(peerErrorMessage(err, 'HOST'))
    })
    peer.on('disconnected', () => {
      try { peer.reconnect() } catch { failNetwork('Lost the multiplayer server. Close and try again.') }
    })
    peer.on('connection', (conn: any) => {
      attachConnection(conn)
      watchConnection(conn, 'HOST')
      conn.on('open', () => { setCoopConfig(prev => ({ ...prev, isHost: true, p1Char: selected })) })
      conn.on('data', (packet: unknown) => {
        const msg = decodeCoopPacket(packet)
        if (!msg) return
        if (msg.opCode === 'CLIENT_HANDSHAKE') {
          setCoopConfig(prev => ({ ...prev, isHost: true, p2Char: msg.payload?.charId || prev.p2Char }))
          setNetworkMessage('')
          setNetworkStatus('CONNECTED')
          try { conn.send({ opCode: 'SERVER_ACK', payload: { charId: selected } }) } catch (err) { console.error('Host ack failed:', err) }
        }
        if (msg.opCode === 'REPLAY_REQ') setGameSessionId(Date.now())
      })
    })
    peerInstance.current = peer
  }

  const connectToHostServer = () => {
    const code = normalizeRoomCode(networkInput)
    setNetworkInput(code)
    if (code.length !== 4) {
      failNetwork('Enter the 4-character room code.')
      return
    }
    destroyPeer()
    setNetworkMessage('')
    setNetworkStatus('CONNECTING')
    const peer = new Peer(PEER_OPTS)
    let opened = false
    const timer = window.setTimeout(() => {
      if (opened) return
      failNetwork('Could not find that room. Check the code and try again.')
      try { peer.destroy() } catch {}
    }, CONNECT_TIMEOUT_MS)
    peer.on('error', (err: { type?: string }) => {
      window.clearTimeout(timer)
      console.error('Guest peer error:', err)
      failNetwork(peerErrorMessage(err, 'GUEST'))
    })
    peer.on('disconnected', () => {
      try { peer.reconnect() } catch { failNetwork('Lost the multiplayer server. Close and try again.') }
    })
    peer.on('open', () => {
      opened = true
      window.clearTimeout(timer)
      const conn = peer.connect(roomPeerId(code), { reliable: true, serialization: 'json' })
      const connTimer = window.setTimeout(() => {
        if (conn.open) return
        failNetwork('The host did not answer. Check the code and try again.')
      }, CONNECT_TIMEOUT_MS)
      watchConnection(conn, 'GUEST')
      conn.on('open', () => {
        window.clearTimeout(connTimer)
        attachConnection(conn)
        try { conn.send({ opCode: 'CLIENT_HANDSHAKE', payload: { charId: selected } }) } catch (err) { console.error('Guest handshake failed:', err) }
        setCoopConfig(prev => ({ ...prev, isHost: false, roomId: code, p2Char: selected }))
      })
      conn.on('data', (packet: unknown) => {
        const msg = decodeCoopPacket(packet)
        if (!msg) return
        if (msg.opCode === 'SERVER_ACK') {
          setCoopConfig(prev => guestApplyServerAck(prev, msg.payload?.charId, selected, code))
          setNetworkMessage('')
          setNetworkStatus('CONNECTED')
        }
        if (msg.opCode === 'GAME_LAUNCH_SEQUENCE' && msg.payload) {
          window.clearTimeout(connTimer)
          setCoopConfig(prev => guestApplyLaunch(prev, msg.payload))
          setShowNetworkLobby(false)
          handleGameLaunch('COOP')
        }
        if (msg.opCode === 'REPLAY_REQ') setGameSessionId(Date.now())
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
    destroyPeer()
    setNetworkRole(null)
    setNetworkStatus('IDLE')
    setNetworkMessage('')
  }

  const chooseView = (next: ViewMode) => {
    setViewMode(next)
    if (next !== '3D') return
    const inCoop = showNetworkLobby || activeEngineMode === 'COOP' || networkRole !== null
    if (!inCoop) return
    setShowNetworkLobby(false)
    setActiveEngineMode('NORMAL')
    setIsGameEngineMounted(false)
    terminateNetworkSession()
  }

  const activeChar = CHARACTERS.find((c) => c.id === selected) ?? CHARACTERS[0]

  // Dynamic header title that reflects the section currently in view.
  const [headerTitle, setHeaderTitle] = useState(t('nav.home'))
  const charSectionRef = useRef<HTMLElement>(null)
  const themesSectionRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY + 140
      const themesTop = themesSectionRef.current?.offsetTop ?? Infinity
      const charTop = charSectionRef.current?.offsetTop ?? Infinity
      if (y >= themesTop) setHeaderTitle(t('nav.themes'))
      else if (y >= charTop) setHeaderTitle(t('nav.characters'))
      else setHeaderTitle(t('nav.home'))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [t])

  // Restoring a persisted session is asynchronous — show a neutral splash
  // instead of flashing the sign-in form at an already-authenticated player.
  if (sessionStatus === 'LOADING') {
    return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[#1a0d2e]">
        <p className="text-sm font-black uppercase tracking-[0.35em] text-[#8ec5ff] animate-pulse">{t('common.loading')}</p>
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
    if (activeEngineMode !== 'COOP' && !showNetworkLobby) terminateNetworkSession()
  }

  const coopOwnsScreen = showNetworkLobby || activeEngineMode === 'COOP' || networkRole !== null || liveConnection != null
  if (!coopOwnsScreen && (activeRelay || (pendingRelay && canEnterApp && !(userId && relayBlocks(pendingRelay, userId))))) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black">
        {activeRelay ? (
          <ErrorBoundary onClose={closeRelay}>
            <Game key={gameSessionId} mode="NORMAL" coopConfig={coopConfig} connection={null} relay={activeRelay} accountId={userId} onClose={closeRelay} onReplay={closeRelay} />
          </ErrorBoundary>
        ) : (
          <div className="grid h-full place-items-center bg-[#11091c]">
            <p className="text-4xl font-black text-white">{t('common.continue')}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-clip overflow-y-visible bg-[#1b1429] pt-20 font-display pb-32 md:pt-24" style={{ background: 'radial-gradient(150% 100% at 50% 0%, #2f1d4a 0%, #11091c 100%)' }}>
      <header className="fixed top-0 left-0 z-50 w-full border-b border-white/5 bg-[#1b1429] shadow-md backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-end gap-2 px-3 py-2 md:justify-between md:p-4">
          <h1 className="hidden text-2xl font-black text-white md:block">{headerTitle}</h1>
          <div className="flex min-w-0 items-center gap-1.5 md:gap-2">
            <button onClick={() => setShowWheel(true)} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-lg text-white md:h-12 md:w-12 md:text-xl">
              🎡 {wheelReady && <span className="absolute top-0 right-0 w-3 h-3 bg-[#6ee7a8] rounded-full"></span>}
            </button>
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-[#170d24] px-3 py-2 text-sm font-black text-[#ffe6a3] md:gap-3 md:px-5 md:py-3 md:text-base">
              <span className="truncate">🪙 {coins}</span>
              <span className="shrink-0 text-[#8ec5ff]">💎 {diamonds}</span>
              <span className="shrink-0 text-[#ff9f43]" title="Daily streak">🔥 {streak.count}</span>
            </div>
            <button onClick={() => setShowChat(true)} aria-label="Chat" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-lg text-white md:h-12 md:w-12 md:text-xl">💬</button>
            <button onClick={() => setShowSettings(true)} aria-label="Account & Settings" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 text-lg text-white md:h-12 md:w-12 md:text-xl">⚙️</button>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto mt-4 px-4">
        <div className="bg-[#2a1c42] rounded-[48px] p-6 shadow-2xl flex flex-col lg:flex-row items-center gap-10">
          {/* no overflow clip: tall accessories spill out instead of forcing
              the character to be scaled down to fit */}
          <div className="relative w-48 h-48 bg-black/30 rounded-[40px] flex items-center justify-center">
            <CharacterView charId={activeChar.id} className="h-32 w-32 drop-shadow-2xl" />
          </div>

          <div className="text-center lg:text-left flex-1 w-full">
            <h2 className="text-4xl font-black text-white mb-2">{activeChar.name}</h2>
            <div className="flex items-center gap-4 justify-center lg:justify-start mb-4">
              <p className="text-white/50 text-sm font-bold uppercase">{t('menu.level', { level: lvl.level, into: lvl.into, need: lvl.need })}</p>
              {streak.count > 0 && <p className="text-[#ff7ad9] text-sm font-bold uppercase">🔥 {t('menu.streak', { count: streak.count })}</p>}
            </div>
            <div className="w-full h-3 bg-black/50 rounded-full mb-10 overflow-hidden"><div className="h-full bg-[#8ec5ff]" style={{ width: `${lvl.pct*100}%` }}></div></div>

            <div className="mb-3 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <span className="text-white/50 text-xs font-black uppercase tracking-wider">{t('menu.view')}</span>
              <LanguageMenu />
              <div className="inline-flex rounded-2xl bg-black/40 p-1" role="group" aria-label="Game perspective">
                {(['2D', '3D'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => chooseView(v)}
                    aria-pressed={viewMode === v}
                    className={`rounded-xl px-6 py-2 text-sm font-black uppercase transition-colors ${viewMode === v ? 'bg-[#ffd24d] text-[#170d24]' : 'text-white/60 hover:text-white'}`}
                  >
                    {t(v === '2D' ? 'view.2d' : 'view.3d')}
                  </button>
                ))}
              </div>
              {viewMode === '3D' && <span className="text-white/40 text-[11px] font-bold">First-person · swipe to look</span>}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
              <button onClick={() => handleGameLaunch('NORMAL')} className="bg-[#6ee7a8] text-[#170d24] py-4 rounded-2xl font-black uppercase">▶ {t('button.play')}</button>
              <button onClick={() => setCustomizeId(activeChar.id)} className="bg-[#412e61] text-white py-4 rounded-2xl font-black uppercase">👕 {t('button.shop')}</button>
              <button onClick={() => setShowChallengePopup(true)} className="bg-[#ff7ad9] text-[#170d24] py-4 rounded-2xl font-black uppercase">🔥 {t('button.hard')}</button>
              {viewMode !== '3D' && (
                <button onClick={() => { relayHandled.current = true; clearPendingRelay(); setPendingRelay(null); setActiveRelay(null); setNetworkRole(null); setCoopConfig(prev => ({ ...prev, isHost: true, p1Char: selected, p2Char: selected })); setShowNetworkLobby(true); }} className="bg-[#8ec5ff] text-[#170d24] py-4 rounded-2xl font-black uppercase">🤝 {t('button.coop')}</button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Character collection — main has pb-32 so scrolling works cleanly */}
      <section ref={charSectionRef} className="max-w-7xl mx-auto mt-12 px-4">
        <h2 className="text-2xl font-black text-white mb-4">{t('menu.characters')}</h2>
        <div className="mb-5 flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
                {f === 'ALL' ? t('rarity.all') : t(rarityMessageKey(f))}
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
                <div className="flex justify-between items-center mb-2"><span className="text-[9px] font-black uppercase px-2 py-0.5 rounded" style={{ color: color, backgroundColor: `${color}20` }}>{t(rarityMessageKey(char.rarity))}</span></div>
                <div className="flex-1 flex justify-center py-4">
                  <div className="h-20 w-20">
                    <CharacterView charId={char.id} className={`h-20 w-20 ${!isOwned ? 'opacity-20 grayscale' : 'drop-shadow-xl'}`} />
                  </div>
                </div>
                <h3 className="text-white font-bold text-center text-sm mb-4 truncate">{char.name}</h3>
                {isOwned ? (
                  <button onClick={() => selectCharacter(char.id)} className={`w-full py-3 rounded-xl font-black text-[11px] uppercase ${isSelected ? 'bg-[#6ee7a8] text-[#123]' : 'bg-white/10 text-white'}`}>{isSelected ? t('char.equipped') : t('char.select')}</button>
                ) : need > 0 ? (
                  <div className="w-full rounded-xl bg-[#12081d] border border-white/10 px-3 py-2.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-black/50">
                      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(have / need) * 100}%`, background: color }} />
                    </div>
                    <p className="mt-1.5 text-center text-[10px] font-black uppercase tracking-wider text-white/60">🎁 {t('char.cards', { have, need })}</p>
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
        <h2 className="text-xl font-black text-white mb-4 px-4">{t('menu.themes')}</h2>
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
                {locked && <div className="absolute inset-0 bg-black/55 z-[5] flex items-center justify-center pointer-events-none"><span className="text-white font-black text-sm">🔒 {t('theme.locked', { level: o.unlockLevel })}</span></div>}
                <div className="relative z-10 w-full bg-black/50 backdrop-blur-md p-3 rounded-xl flex justify-between items-center text-white font-bold text-sm pointer-events-none">
                  <span className="truncate">{o.name}</span>
                  {on ? (
                    <span className="text-[#ffd24d] shrink-0">✓ {t('theme.active')}</span>
                  ) : isOwned ? (
                    <span className="text-[#6ee7a8] shrink-0">{t('theme.select')}</span>
                  ) : (
                    <span className={`shrink-0 ${canAfford ? '' : 'text-[#ff9e9e]'}`}>{isDiamond ? '💎' : '🪙'} {o.price}</span>
                  )}
                </div>
              </button>
            )
          })}
        </HScroll>
      </section>

      {(showNetworkLobby || (isGameEngineMounted && activeEngineMode === 'COOP')) && (
        <div className="fixed left-4 z-[1200] inline-flex rounded-2xl bg-[#170d24] p-1 shadow-lg" style={{ top: 'max(1rem, env(safe-area-inset-top))' }} role="group" aria-label="Game perspective">
          {(['2D', '3D'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => chooseView(v)}
              aria-pressed={viewMode === v}
              className={`rounded-xl px-4 py-2 text-sm font-black uppercase ${viewMode === v ? 'bg-[#ffd24d] text-[#170d24]' : 'text-white/70'}`}
            >
              {t(v === '2D' ? 'view.2d' : 'view.3d')}
            </button>
          ))}
        </div>
      )}

      {/* LOBBY P2P */}
      {showNetworkLobby && viewMode !== '3D' && (
        <div className="fixed inset-0 z-[800] flex items-center justify-center bg-black/90 p-4">
          <button onClick={() => {setShowNetworkLobby(false); terminateNetworkSession()}} className="absolute top-8 right-8 w-14 h-14 bg-white/10 rounded-full text-white text-2xl z-50">✕</button>
          <div className="bg-[#1f1333] p-8 rounded-[48px] w-full max-w-lg shadow-2xl text-center">
            <h2 className="text-4xl font-black text-white mb-8">Multiplayer P2P</h2>
            {!networkRole && (
              <div className="flex flex-col gap-4">
                {sameDeviceCoop && (
                  <>
                    <button onClick={() => executeCoopLaunch('P1')} className="bg-[#ffd24d] py-6 rounded-3xl font-black text-xl text-[#123]">Play together on this device</button>
                    <p className="text-sm font-bold text-white/60">Left side or Space = Player 1. Right side, W, or ↑ = Player 2.</p>
                  </>
                )}
                <button onClick={initializeHostServer} className="bg-[#8ec5ff] py-6 rounded-3xl font-black text-xl text-[#123]">Create Room (Host)</button>
                <button onClick={() => { setNetworkMessage(''); setNetworkStatus('IDLE'); setNetworkRole('GUEST'); setCoopConfig(prev => ({ ...prev, isHost: false, p2Char: selected })); }} className="bg-[#6ee7a8] py-6 rounded-3xl font-black text-xl text-[#123]">Join with Code (Guest)</button>
              </div>
            )}
            {networkRole === 'HOST' && (
              <div>
                <p className="text-[#8ec5ff] mb-2 font-bold uppercase">Your Room Code</p>
                <div className="bg-black/50 py-6 rounded-3xl mb-6"><p className="text-6xl font-black text-[#8ec5ff]">{networkCode || '----'}</p></div>
                {networkStatus === 'CONNECTED' ? (
                  <div className="flex flex-col gap-4 bg-[#8ec5ff]/10 p-6 rounded-3xl">
                    <p className="text-[#6ee7a8] font-black uppercase">Ready</p>
                    <button onClick={() => executeCoopLaunch('P1')} className="bg-[#ffd24d] py-4 rounded-xl font-bold text-[#123]">Start Game — I play in front</button>
                    <button onClick={() => executeCoopLaunch('P2')} className="bg-white/10 text-white py-4 rounded-xl font-bold">Start Game — friend plays in front</button>
                  </div>
                ) : networkStatus === 'ERROR' ? (
                  <div className="flex flex-col gap-4">
                    <p className="text-[#ff7a7a] font-bold">{networkMessage || 'Network error. Close and try again.'}</p>
                    <button onClick={initializeHostServer} className="bg-[#8ec5ff] py-4 rounded-xl font-black text-[#123]">Try again</button>
                  </div>
                ) : networkStatus === 'CONNECTING' ? (
                  <p className="text-white animate-pulse">Opening room...</p>
                ) : <p className="text-white animate-pulse">Waiting for Player 2...</p>}
              </div>
            )}
            {networkRole === 'GUEST' && (
              <div className="flex flex-col gap-4">
                <input type="text" inputMode="numeric" autoCapitalize="characters" value={networkInput} onChange={(e) => setNetworkInput(normalizeRoomCode(e.target.value))} placeholder="0000" className="text-center text-6xl font-black py-6 rounded-3xl bg-black/40 text-white outline-none" maxLength={4} />
                {networkStatus === 'CONNECTED' ? (
                  <p className="text-[#6ee7a8] font-black uppercase">Ready. Waiting for the host to start.</p>
                ) : networkStatus === 'ERROR' ? (
                  <p className="text-[#ff7a7a] font-bold">{networkMessage || 'Connection failed. Check the code and try again.'}</p>
                ) : networkStatus === 'CONNECTING' ? (
                  <p className="text-white/70 font-bold animate-pulse">Connecting...</p>
                ) : null}
                <button onClick={connectToHostServer} disabled={normalizeRoomCode(networkInput).length !== 4 || networkStatus === 'CONNECTING' || networkStatus === 'CONNECTED'} className="mt-2 bg-[#6ee7a8] py-6 rounded-3xl font-black text-xl text-[#123] disabled:opacity-40">Connect</button>
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
             {viewMode === '3D' && activeEngineMode !== 'COOP' && !activeRelay ? (
               <Suspense fallback={<div className="fixed inset-0 grid place-items-center bg-black"><p className="text-2xl font-black text-white animate-pulse">Loading 3D…</p></div>}>
                 <Game3D
                   key={gameSessionId}
                   mode={activeEngineMode}
                   coopConfig={coopConfig}
                   connection={liveConnection}
                   onClose={() => { setIsGameEngineMounted(false); terminateNetworkSession(); }}
                   onReplay={() => { if (activeEngineMode === 'COOP' && dataConnection.current) { dataConnection.current.send({ opCode: 'REPLAY_REQ' }) }; setGameSessionId(Date.now()) }}
                 />
               </Suspense>
             ) : (
             <Game key={gameSessionId} mode={activeEngineMode} coopConfig={coopConfig} connection={liveConnection} relay={activeRelay} accountId={userId} onClose={() => { setIsGameEngineMounted(false); setActiveRelay(null); terminateNetworkSession(); }} onReplay={() => { if(activeEngineMode==='COOP' && dataConnection.current){dataConnection.current.send({opCode:'REPLAY_REQ'})}; setGameSessionId(Date.now()) }} />
             )}
           </ErrorBoundary>
        </div>
      )}
      
      {/* CONT & SETĂRI */}
      {showSettings && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="relative max-h-[90vh] w-full max-w-[400px] overflow-y-auto rounded-[32px] border border-white/10 bg-[#1f1333] p-6" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <button onClick={() => setShowSettings(false)} className="settings-close absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white">✕</button>
            <p className="font-display text-[11px] uppercase tracking-[0.35em] text-[#8ec5ff]">{t('settings.account')}</p>
            <h2 className="font-display text-3xl font-black text-white mb-5">{t('settings.title')}</h2>
            <div className="mb-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-white/40">{t('settings.language')}</p>
              <LanguageMenu />
            </div>

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
                        {isProfileLoading ? t('auth.saving') : t('settings.save')}
                      </button>
                      <button
                        onClick={() => setIsEditingUsername(false)}
                        className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black uppercase text-white"
                      >
                        {t('settings.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-white/40 text-[10px] font-black uppercase tracking-wider">{t('settings.signedIn')}</p>
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
                <p className="text-[10px] font-black uppercase text-white/40">{t('settings.best')}</p>
              </div>
              <div className="rounded-2xl bg-black/30 p-3 text-center">
                <p className="text-2xl font-black text-[#6ee7a8]">{lvl.level}</p>
                <p className="text-[10px] font-black uppercase text-white/40">{t('settings.level')}</p>
              </div>
              <div className="rounded-2xl bg-black/30 p-3 text-center">
                <p className="text-2xl font-black text-[#ff7ad9]">{totalGames}</p>
                <p className="text-[10px] font-black uppercase text-white/40">{t('settings.games')}</p>
              </div>
              <div className="rounded-2xl bg-black/30 p-3 text-center">
                <p className="text-2xl font-black text-[#ff9f43]">🔥{streak.count}</p>
                <p className="text-[10px] font-black uppercase text-white/40">{t('settings.streak')}</p>
              </div>
            </div>

            <button onClick={() => setMutedState(toggleMuted())} className="mb-3 flex w-full items-center justify-between rounded-2xl bg-black/30 p-4 text-white">
              <span className="font-bold">{muted ? '🔇' : '🔊'} {t('settings.sound')}</span>
              <span className={`grid h-7 w-12 items-center rounded-full px-1 transition-colors ${muted ? 'bg-white/15' : 'bg-[#6ee7a8]'}`}>
                <span className={`settings-sound-knob h-5 w-5 rounded-full bg-white transition-transform ${muted ? '' : 'translate-x-5'}`} />
              </span>
            </button>

            {/* Friends — layout only. Controls are disabled so they read as
                "not built yet" rather than broken. */}
            <div className="mb-3 rounded-2xl bg-black/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-bold text-white">👥 {t('settings.friends')}</p>
                <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-black uppercase text-white/50">{t('settings.soon')}</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled
                  placeholder={t('settings.searchPlaceholder')}
                  className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none disabled:opacity-60"
                />
                <button
                  disabled
                  className="rounded-xl bg-[#8ec5ff] px-4 py-2.5 text-xs font-black uppercase text-[#123] disabled:opacity-40"
                >
                  {t('settings.search')}
                </button>
              </div>
            </div>

            {logoutError && <p className="mb-3 text-center text-xs font-bold text-[#ff4d4d]">{logoutError}</p>}
            {isGuestPlay ? (
              <div>
                <p className="mb-3 text-center text-sm font-bold text-[#8ec5ff]">{t('settings.guestHint')}</p>
                <button
                  onClick={() => { setIsEditingUsername(false); setShowSettings(false); disableGuestPlay() }}
                  className="w-full rounded-2xl bg-[#6ee7a8] py-4 font-black uppercase text-[#170d24]"
                >
                  {t('settings.login')}
                </button>
              </div>
            ) : (
              <button onClick={() => void handleLogout()} className="w-full rounded-2xl bg-[#ff6b6b] py-4 font-black uppercase text-white">{t('settings.logout')}</button>
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