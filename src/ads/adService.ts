/**
 * CrazyGames SDK v3 rewarded-ad helper.
 *
 * The SDK script is loaded from index.html. `initAdSdk()` runs at boot.
 * A reward is granted only from `adFinished`. `adError`, a missing SDK, or a
 * failed init never grants a reward in a production build. `vite` dev may
 * show a local countdown so revive can be tested without the portal.
 */
import { isMuted, setMuted } from '../sfx'

type RewardedAdCallbacks = {
  adFinished?: () => void
  adError?: (error?: unknown) => void
  adStarted?: () => void
}

type CrazyGameApi = {
  loadingStart?: () => void
  loadingStop?: () => void
  gameplayStart?: () => void
  gameplayStop?: () => void
}

type CrazyGamesSDK = {
  init?: () => Promise<void> | void
  game?: CrazyGameApi
  ad?: {
    requestAd?: (type: string, callbacks?: RewardedAdCallbacks) => Promise<void> | void
  }
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSDK }
  }
}

const MOCK_SECONDS = 3
let initPromise: Promise<void> | null = null
let sdkReady = false
let loadingState: 'idle' | 'started' | 'stopped' = 'idle'
let shellReady = false
let wantGameplay = false
let gameplayOn = false

function callGame(method: keyof CrazyGameApi) {
  try {
    window.CrazyGames?.SDK?.game?.[method]?.()
  } catch (err) {
    console.warn(`[ads] ${method} failed.`, err)
  }
}

function finishLoading() {
  if (loadingState !== 'started' || !shellReady) return
  callGame('loadingStop')
  loadingState = 'stopped'
}

function beginLoading() {
  if (loadingState !== 'idle' || !sdkReady) return
  callGame('loadingStart')
  loadingState = 'started'
  finishLoading()
}

/** Call once the existing boot splash has finished. Does not add a new screen. */
export function notifyShellReady() {
  if (shellReady) return
  shellReady = true
  finishLoading()
}

function flushGameplay() {
  if (!sdkReady) return
  if (wantGameplay && !gameplayOn) {
    gameplayOn = true
    callGame('gameplayStart')
  } else if (!wantGameplay && gameplayOn) {
    gameplayOn = false
    callGame('gameplayStop')
  }
}

export function markGameplayStart() {
  wantGameplay = true
  flushGameplay()
}

export function markGameplayStop() {
  wantGameplay = false
  flushGameplay()
}

function sdkAvailable(): boolean {
  return Boolean(window.CrazyGames?.SDK?.ad?.requestAd)
}

export function initAdSdk(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const sdk = typeof window !== 'undefined' ? window.CrazyGames?.SDK : undefined
    if (!sdk?.init) {
      sdkReady = sdkAvailable()
      beginLoading()
      flushGameplay()
      return
    }
    try {
      await sdk.init()
      sdkReady = true
      beginLoading()
      flushGameplay()
    } catch (err) {
      console.warn('[ads] CrazyGames SDK init failed. Ads stay off.', err)
      sdkReady = false
    }
  })()
  return initPromise
}

function showMockCountdown(seconds: number): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(true)
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.setAttribute('data-ad-mock', '1')
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483000',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'background:rgba(10,5,16,0.92)',
      'color:#fff',
      'font-family:Fredoka,Nunito,sans-serif',
      'text-align:center',
      'padding:24px',
    ].join(';')

    const title = document.createElement('p')
    title.textContent = 'Rewarded ad (local preview)'
    title.style.cssText = 'margin:0 0 8px;font-size:14px;letter-spacing:0.2em;text-transform:uppercase;color:#ffd24d;font-weight:800'

    const count = document.createElement('p')
    count.style.cssText = 'margin:0;font-size:72px;font-weight:900;line-height:1'
    count.textContent = String(seconds)

    const hint = document.createElement('p')
    hint.textContent = 'Watch the full countdown to earn the reward'
    hint.style.cssText = 'margin:16px 0 0;font-size:14px;color:rgba(255,255,255,0.6);font-weight:700'

    overlay.append(title, count, hint)
    document.body.appendChild(overlay)

    let left = seconds
    const tick = window.setInterval(() => {
      left -= 1
      if (left > 0) {
        count.textContent = String(left)
        return
      }
      window.clearInterval(tick)
      overlay.remove()
      resolve(true)
    }, 1000)
  })
}

/**
 * Plays one CrazyGames rewarded video.
 * Resolves true only when the player finishes the ad (`adFinished`).
 * Resolves false when the ad is skipped, unfilled, or errors (`adError`).
 */
export async function showRewardedAd(): Promise<boolean> {
  await initAdSdk()
  const requestAd = window.CrazyGames?.SDK?.ad?.requestAd
  if (!requestAd || !sdkReady) {
    if (import.meta.env.DEV) return showMockCountdown(MOCK_SECONDS)
    return false
  }

  const wasMuted = isMuted()
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      if (!wasMuted) setMuted(false)
      resolve(ok)
    }
    try {
      requestAd.call(window.CrazyGames!.SDK!.ad, 'rewarded', {
        adStarted: () => {
          if (!wasMuted) setMuted(true)
        },
        adFinished: () => finish(true),
        adError: (error) => {
          console.warn('[ads] rewarded ad was skipped or failed.', error)
          finish(false)
        },
      })
    } catch (err) {
      console.warn('[ads] requestAd threw.', err)
      finish(false)
    }
  })
}

/** One midgame break. No reward. A missing or failed ad returns immediately. */
export async function showMidgameAd(): Promise<void> {
  try {
    await initAdSdk()
    const requestAd = window.CrazyGames?.SDK?.ad?.requestAd
    if (!requestAd || !sdkReady) return
    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        resolve()
      }
      try {
        requestAd.call(window.CrazyGames!.SDK!.ad, 'midgame', {
          adStarted: () => {},
          adFinished: () => done(),
          adError: () => done(),
        })
      } catch (err) {
        console.warn('[ads] midgame request failed.', err)
        done()
      }
    })
  } catch (err) {
    console.warn('[ads] midgame skipped.', err)
  }
}
