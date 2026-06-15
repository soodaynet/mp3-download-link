import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
          <div className="text-center px-4">
            <p className="text-white/50 text-sm font-mono">出错了</p>
            <p className="text-white/30 text-xs mt-2 font-mono">
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-4 py-2 text-xs rounded-xl bg-white/10 text-white/60
                         hover:bg-white/20 transition-colors"
            >
              重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}