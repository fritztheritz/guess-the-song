import { Component, type ErrorInfo, type ReactNode } from 'react'
import ErrorState from './ui/ErrorState'

// Last line of defence: if a page throws while rendering (or its code chunk can't load), show what
// happened and a way out instead of a blank screen. Keyed by route in App so navigating away resets it.
export default class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="min-h-svh court-lines">
        <div className="mx-auto max-w-md px-6 py-24">
          <ErrorState message="Something went wrong on this page.">
            <p className="mt-1 text-xs text-slate-400">Your games are saved on this device and aren't affected.</p>
            <div className="mt-3 flex gap-4 text-xs">
              <button onClick={() => window.location.reload()} className="font-semibold text-slate-200 underline hover:text-white">
                Reload the page
              </button>
              <a href={import.meta.env.BASE_URL} className="text-slate-400 underline hover:text-slate-200">
                Back to home
              </a>
            </div>
          </ErrorState>
        </div>
      </div>
    )
  }
}
