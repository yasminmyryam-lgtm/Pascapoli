/**
 * CrazyGames SDK v3 rewarded-ad helper.
 *
 * A reward is granted only when every ad in the sequence is fully watched.
 * Local development (and any environment without the SDK) uses a 3-second
 * mock countdown so gameplay can still be tested.
 */

type RewardedAdCallbacks = {
  adFinished?: () => void
  adError?: (error?: unknown) => void
  adStarted?: () => void
}

type CrazyGamesSDK = {
  init?: () => Promise<void> | void
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

function isLocalDev(): boolean {
  if (typeof window === 'undefined') return true
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
}

function sdkAvailable(): boolean {
  return Boolean(window.CrazyGames?.SDK?.ad?.requestAd)
}

export function initAdSdk(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const sdk = typeof window !== 'undefined' ? window.CrazyGames?.SDK : undefined
    if (!sdk?.init) return
    try {
      await sdk.init()
      sdkReady = true
    } catch (err) {
      console.warn('[ads] CrazyGames SDK init failed; using local mock.', err)
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

function requestRewardedAd(): Promise<boolean> {
  const requestAd = window.CrazyGames?.SDK?.ad?.requestAd
  if (!requestAd) return showMockCountdown(MOCK_SECONDS)

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      const result = requestAd.call(window.CrazyGames!.SDK!.ad, 'rewarded', {
        adStarted: () => {},
        adFinished: () => finish(true),
        adError: () => finish(false),
      })
      if (result && typeof (result as Promise<void>).then === 'function') {
        ;(result as Promise<void>).then(() => finish(true)).catch(() => finish(false))
      }
    } catch (err) {
      console.warn('[ads] requestAd threw; using local mock.', err)
      showMockCountdown(MOCK_SECONDS).then(finish)
    }
  })
}

/**
 * Plays `count` rewarded videos one after another.
 * Returns true only when every ad is fully watched (or the local mock completes).
 */
export async function playRewardedAdSequence(count = 2): Promise<boolean> {
  const n = Math.max(1, Math.floor(Number(count) || 2))
  await initAdSdk()

  const useMock = isLocalDev() || !sdkAvailable() || !sdkReady
  for (let i = 0; i < n; i += 1) {
    const ok = useMock ? await showMockCountdown(MOCK_SECONDS) : await requestRewardedAd()
    if (!ok) return false
  }
  return true
}
