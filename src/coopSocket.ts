import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Handler = (payload?: any) => void

export type CoopLink = {
  open: boolean
  send: (msg: unknown) => void
  on: (event: string, cb: Handler) => void
  off: (event: string, cb: Handler) => void
  close: () => void
}

export type CoopSession = {
  link: CoopLink
  start: (hooks: { onReady: () => void; onFail: (message: string) => void }) => void
  destroy: () => void
}

const STATE_OPS = new Set(['STATE', '3D_STATE'])
const HOST_BEACON = '__HERE'
const GUEST_BEACON = '__PING'
const BEACON_MS = 2000
const PEER_TIMEOUT_MS = 15000

/**
 * Room transport over Supabase Realtime.
 * The public PeerJS relays no longer resolve, so a direct WebRTC dial fails
 * as soon as the two players are on different networks. Broadcast messages
 * go through the project database socket instead, which both sides can reach.
 */
export function createCoopRoom(code: string, role: 'HOST' | 'GUEST'): CoopSession {
  const handlers: Record<string, Set<Handler>> = {}
  let open = false
  let destroyed = false
  let started = false
  let channel: RealtimeChannel | null = null
  let beaconTimer: number | undefined
  let peerTimer: number | undefined
  let stateTimer: number | undefined
  let pendingState: unknown
  let lastStateSend = 0

  const emit = (event: string, payload?: any) => {
    handlers[event]?.forEach((cb) => {
      try { cb(payload) } catch (err) { console.error('Co-op listener failed:', err) }
    })
  }

  const markPeer = () => {
    if (peerTimer != null) window.clearTimeout(peerTimer)
    peerTimer = window.setTimeout(() => {
      if (destroyed || !open) return
      open = false
      emit('close')
    }, PEER_TIMEOUT_MS)
  }

  const transmit = (msg: unknown) => {
    if (!channel || destroyed) return
    void channel.send({ type: 'broadcast', event: 'packet', payload: msg })
  }

  const link: CoopLink = {
    get open() { return open },
    send(msg: unknown) {
      if (!open || destroyed) return
      const op = msg && typeof msg === 'object' && 'opCode' in msg ? String((msg as { opCode?: string }).opCode) : ''
      if (!STATE_OPS.has(op)) {
        transmit(msg)
        return
      }
      const now = Date.now()
      const wait = 50 - (now - lastStateSend)
      if (wait <= 0) {
        lastStateSend = now
        transmit(msg)
        return
      }
      pendingState = msg
      if (stateTimer != null) return
      stateTimer = window.setTimeout(() => {
        stateTimer = undefined
        lastStateSend = Date.now()
        const next = pendingState
        pendingState = undefined
        if (next !== undefined && open && !destroyed) transmit(next)
      }, wait)
    },
    on(event: string, cb: Handler) {
      ;(handlers[event] ??= new Set()).add(cb)
    },
    off(event: string, cb: Handler) {
      handlers[event]?.delete(cb)
    },
    close() { destroy() },
  }

  const notePeer = (announce: boolean) => {
    if (destroyed) return
    markPeer()
    if (!announce || open) return
    open = true
    emit('open')
  }

  function destroy() {
    if (destroyed) return
    destroyed = true
    open = false
    if (beaconTimer != null) window.clearInterval(beaconTimer)
    if (peerTimer != null) window.clearTimeout(peerTimer)
    if (stateTimer != null) window.clearTimeout(stateTimer)
    const current = channel
    channel = null
    if (current) void supabase.removeChannel(current)
  }

  return {
    link,
    destroy,
    start({ onReady, onFail }) {
      if (started || destroyed) return
      started = true
      const room = supabase.channel(`pastapoli-room-${code}`, {
        config: { broadcast: { self: false } },
      })
      channel = room
      room.on('broadcast', { event: 'packet' }, ({ payload }) => {
        if (destroyed || !payload || typeof payload !== 'object') return
        const op = (payload as { opCode?: string }).opCode
        if (op === HOST_BEACON) {
          if (role === 'GUEST') notePeer(true)
          return
        }
        if (op === GUEST_BEACON) {
          if (role === 'HOST') notePeer(true)
          return
        }
        // Open before delivering the packet so the handshake reply can be sent
        // in the same turn the first message arrives.
        notePeer(true)
        emit('data', payload)
      })
      room.subscribe((status) => {
        if (destroyed) return
        if (status === 'SUBSCRIBED') {
          const beacon = role === 'HOST' ? HOST_BEACON : GUEST_BEACON
          transmit({ opCode: beacon })
          beaconTimer = window.setInterval(() => transmit({ opCode: beacon }), BEACON_MS)
          onReady()
          return
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onFail('Could not reach the multiplayer server. Check your connection and try again.')
        }
      })
    },
  }
}
