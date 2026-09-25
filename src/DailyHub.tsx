import React from 'react'
import { MISSIONS, missionProgress, missionDone } from './missions'
import { useGameState, useActions } from './store'

export default function DailyHub({ onClose }: { onClose: () => void }) {
  const { daily, streak } = useGameState()
  const { claimMissionReward } = useActions()

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={onClose}>
      <button onClick={onClose} className="fixed top-6 right-6 z-[110] w-12 h-12 rounded-full bg-white/10 text-white font-bold text-xl hover:bg-white/20 transition">✕</button>
      
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-[40px] bg-[#2a1c42] p-8 shadow-2xl border border-white/10" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-3xl font-black text-white text-center mb-2">Daily Hub</h2>
        
        <div className="bg-black/30 rounded-2xl p-4 mb-6 text-center border border-white/5">
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">Day Streak</p>
          <p className="text-3xl font-black text-[#ff7ad9]">🔥 {streak.count} Days</p>
        </div>

        <div className="flex flex-col gap-3">
          {MISSIONS.map(m => {
            const isDone = missionDone(m, daily)
            const isClaimed = daily.claimed.includes(m.id)
            const progress = missionProgress(m, daily)

            return (
              <div key={m.id} className="bg-white/5 rounded-2xl p-4 border border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-white font-bold text-sm">{m.label}</p>
                  <p className="text-white/50 text-xs mt-1">{progress} / {m.goal}</p>
                </div>
                {isClaimed ? (
                  <span className="text-white/30 font-bold text-xs bg-black/40 px-3 py-1.5 rounded-lg">CLAIMED</span>
                ) : isDone ? (
                  <button onClick={() => { claimMissionReward(m.id, m.reward.coins, m.reward.xp) }} className="bg-[#ffd24d] text-[#123] font-black text-xs px-4 py-2 rounded-xl shadow-lg">CLAIM</button>
                ) : (
                  <span className="text-[#6ee7a8] font-bold text-xs bg-[#6ee7a8]/10 px-3 py-1.5 rounded-lg border border-[#6ee7a8]/20">{Math.floor((progress/m.goal)*100)}%</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}