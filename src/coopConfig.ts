export type CoopConfig = {
  roomId: string
  isHost: boolean
  p1Char: string
  p2Char: string
  frontPlayer: 'P1' | 'P2'
  gameSeed: number
  hostBg: string
}

/** Guest records the host as P1 and keeps their own selected character as P2. */
export function guestApplyServerAck(
  prev: CoopConfig,
  hostCharId: string,
  guestCharId: string,
  roomId: string,
): CoopConfig {
  return {
    ...prev,
    p1Char: hostCharId,
    p2Char: guestCharId,
    isHost: false,
    roomId,
  }
}

/** Guest inherits match setup from the host — background, seed, lane — not the guest character. */
export function guestApplyLaunch(
  prev: CoopConfig,
  payload: { frontPlayer: 'P1' | 'P2'; seed: number; hostBg: string; p1Char?: string },
): CoopConfig {
  return {
    ...prev,
    isHost: false,
    frontPlayer: payload.frontPlayer,
    gameSeed: payload.seed,
    hostBg: payload.hostBg,
    // Opponent (host) sprite only. Never copy a host character onto P2.
    ...(payload.p1Char ? { p1Char: payload.p1Char } : {}),
  }
}
