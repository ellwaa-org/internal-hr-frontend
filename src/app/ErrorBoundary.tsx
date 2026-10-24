import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

// Without a boundary, any render error unmounts the whole tree and the user
// sees a blank white page with no way to recover except a manual reload.
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          dir="rtl"
          className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
        >
          <h1 className="text-xl font-bold text-neutral-900">حدث خطأ غير متوقع</h1>
          <p className="max-w-md text-sm text-neutral-600">
            نعتذر، حدث خطأ أثناء عرض هذه الصفحة. يرجى إعادة تحميل الصفحة والمحاولة مرة أخرى.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            إعادة تحميل الصفحة
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
