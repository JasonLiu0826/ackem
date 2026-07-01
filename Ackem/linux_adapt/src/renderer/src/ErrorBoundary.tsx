import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { err: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error): State {
    return { err }
  }

  override componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error('[Ackem renderer]', err, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.err) {
      return (
        <div
          style={{
            boxSizing: 'border-box',
            minHeight: '100vh',
            padding: 24,
            fontFamily: 'system-ui,sans-serif',
            background: '#fafafa',
            color: '#18181b'
          }}
        >
          <h1 style={{ fontSize: 18, margin: '0 0 12px' }}>界面渲染出错</h1>
          <p style={{ margin: '0 0 8px', color: '#52525b', fontSize: 13 }}>
            开发模式下请查看已弹出的开发者工具 Console；或把下面信息发 issue。
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 12,
              background: '#fff',
              border: '1px solid #e4e4e7',
              borderRadius: 8,
              fontSize: 12,
              overflow: 'auto',
              whiteSpace: 'pre-wrap'
            }}
          >
            {this.state.err.stack ?? this.state.err.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
