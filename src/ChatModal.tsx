/**
 * Chat — layout only. Controls are disabled so they read as "not built yet"
 * rather than broken. Messaging will be wired up with the game server.
 */
export default function ChatModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={onClose}>
      <button onClick={onClose} aria-label="Close chat" className="fixed top-6 right-6 z-[110] w-12 h-12 rounded-full bg-white/10 text-white font-bold text-xl hover:bg-white/20 transition">✕</button>

      <div className="relative flex h-[min(620px,85vh)] w-full max-w-md flex-col overflow-hidden rounded-[40px] border border-white/10 bg-[#2a1c42] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-display text-[11px] uppercase tracking-[0.35em] text-[#ff7ad9]">Social</p>
            <h2 className="text-3xl font-black text-white">Chat</h2>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase text-white/50">Soon</span>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto">
          {['Global', 'Friends', 'Team'].map((tab, i) => (
            <button
              key={tab}
              disabled
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-black uppercase disabled:cursor-not-allowed ${i === 0 ? 'bg-[#ff7ad9] text-[#123]' : 'bg-white/10 text-white/50'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-1 flex-col items-center justify-center rounded-3xl bg-black/30 p-6 text-center">
          <p className="mb-2 text-4xl">💬</p>
          <p className="font-bold text-white/60">No messages yet</p>
          <p className="mt-1 text-xs text-white/30">Chat with other players is coming soon.</p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            disabled
            placeholder="Write a message…"
            className="min-w-0 flex-1 rounded-2xl bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 outline-none disabled:opacity-60"
          />
          <button disabled className="rounded-2xl bg-[#ff7ad9] px-5 py-3 text-xs font-black uppercase text-[#123] disabled:opacity-40">
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
