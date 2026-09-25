import type { Daily } from './store'

export type Mission = {
  id: string
  label: string
  goal: number
  metric: 'games' | 'coins' | 'bestScore'
  reward: { coins?: number; xp?: number }
}

export const MISSIONS: Mission[] = [
  { id: 'play3', label: 'Play 3 games', goal: 3, metric: 'games', reward: { coins: 50 } },
  { id: 'coins20', label: 'Collect 20 coins', goal: 20, metric: 'coins', reward: { coins: 40 } },
  { id: 'score10', label: 'Reach a score of 10', goal: 10, metric: 'bestScore', reward: { xp: 120 } },
  { id: 'coins50', label: 'Collect 50 coins', goal: 50, metric: 'coins', reward: { coins: 150 } },
]

export function missionProgress(m: Mission, daily: Daily): number {
  return Math.min(daily[m.metric], m.goal)
}
export function missionDone(m: Mission, daily: Daily): boolean {
  return daily[m.metric] >= m.goal
}
