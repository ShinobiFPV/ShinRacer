import { Component } from 'react'
import { C, Card, Btn } from './primitives'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('View crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      const details = String(this.state.error?.stack || this.state.error?.message || this.state.error)
      return (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
          <Card style={{ maxWidth: 520, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontFamily: C.head, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>This view crashed</div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.red, background: C.bg, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: 12, marginBottom: 16, textAlign: 'left', whiteSpace: 'pre-wrap', maxHeight: 160, overflowY: 'auto' }}>
              {details}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Btn variant="subtle" size="sm" onClick={() => navigator.clipboard.writeText(details)}>Copy error</Btn>
              <Btn size="sm" onClick={() => this.setState({ error: null })}>Reload view</Btn>
            </div>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}
