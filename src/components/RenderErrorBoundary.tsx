import { Component, type ErrorInfo, type ReactNode } from "react"

type Props = {
  children: ReactNode
  fallback: (error: Error, retry: () => void) => ReactNode
}

type State = {
  error: Error | null
}

/**
 * Catches render errors so a single child failure cannot blank the whole page.
 */
export class RenderErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("RenderErrorBoundary caught", error, info.componentStack)
    }
  }

  retry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.retry)
    }
    return this.props.children
  }
}
