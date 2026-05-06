import { Component } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { ThemeProvider, useTheme } from './context/ThemeContext.jsx'
import AuthScreen from './components/auth/AuthScreen.jsx'
import Layout from './components/layout/Layout.jsx'

class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f0f9ff',
          fontFamily: 'Inter, sans-serif',
        }}>
          <div style={{ maxWidth: 480, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#0f172a' }}>
              Error al cargar la aplicación
            </div>

            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20, wordBreak: 'break-all' }}>
              {this.state.error.message}
            </div>

            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                background: '#0ea5e9',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Recargar
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function LoadingScreen() {
  const { theme } = useTheme()
  return (
    <div className="auth-screen">
      <div className="loading-panel">
        <img
          src={theme === 'dark' ? './logo-dark.png' : './logo-light.png'}
          alt="DataVision"
          style={{ width: 200, height: 'auto', objectFit: 'contain', marginBottom: 20 }}
        />
        <div className="spinner" />
      </div>
    </div>
  )
}

function AppGate() {
  const { session, profile, loading } = useAuth()

  // Profile from cache → show app immediately; session validates in background
  if (profile) return <Layout />
  if (loading) return <LoadingScreen />
  return <AuthScreen />
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <AppGate />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
