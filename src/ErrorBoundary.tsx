import React from 'react'

type Props = { children: React.ReactNode; onClose?: () => void }
type State = { hasError: boolean }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    // Avoid a white screen: catch the error and show the fallback.
    console.error('ErrorBoundary caught an error:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 p-6 text-center font-display">
          <h2 className="mb-4 text-3xl font-black text-white">Something broke 🍝</h2>
          <p className="mb-8 max-w-sm text-sm font-bold text-white/50">
            Don't worry, your progress is saved. Try again.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => this.setState({ hasError: false })}
              className="rounded-2xl bg-[#6ee7a8] px-8 py-4 font-black uppercase text-[#170d24]"
            >
              Try Again
            </button>
            {this.props.onClose && (
              <button
                onClick={() => {
                  this.setState({ hasError: false })
                  this.props.onClose?.()
                }}
                className="rounded-2xl border border-white/20 bg-white/10 px-8 py-4 font-black uppercase text-white"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
