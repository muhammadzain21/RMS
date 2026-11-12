import React from 'react'

/**
 * Catches React render errors so one bad page cannot blank the whole app.
 * Use around routes / outlets; Reset remounts children via key bump.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null, resetKey: 0 }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    try {
      console.error('[ErrorBoundary]', error, info?.componentStack)
    } catch {}
    try {
      // Lightweight breadcrumb for post-deploy debugging (never throws)
      const prev = JSON.parse(sessionStorage.getItem('rms_last_ui_error') || 'null')
      sessionStorage.setItem('rms_last_ui_error', JSON.stringify({
        at: new Date().toISOString(),
        message: String(error?.message || error || ''),
        path: typeof location !== 'undefined' ? location.href : '',
        prev: prev?.message || null,
      }))
    } catch {}
  }

  handleReset = () => {
    this.setState((s) => ({ error: null, info: null, resetKey: s.resetKey + 1 }))
    if (typeof this.props.onReset === 'function') {
      try { this.props.onReset() } catch {}
    }
  }

  render() {
    if (this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          reset: this.handleReset,
        })
      }
      const msg = this.state.error?.message || String(this.state.error || 'Unexpected error')
      return (
        <div className="mx-auto max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Something went wrong</h2>
          <p className="mt-2 text-sm text-[var(--color-text-body)]">
            This screen hit an error. The rest of the app is still running — try again or open another page.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-black/5 p-3 text-xs text-[var(--color-text-muted)] dark:bg-white/5">
            {msg}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-lg bg-[var(--color-primary,#2563eb)] px-4 py-2 text-sm font-medium text-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                try { window.location.hash = '#/' } catch {}
                try { if (!window.location.hash) window.location.href = '/' } catch {}
                this.handleReset()
              }}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)]"
            >
              Go home
            </button>
          </div>
        </div>
      )
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>
  }
}
