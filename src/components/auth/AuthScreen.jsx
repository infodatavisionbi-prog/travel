import { useState, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { useLang } from '../../context/LanguageContext.jsx'
import { LANGS } from '../../i18n/index.js'
import { resetStickyMobileZoom } from '../../lib/mobileViewport.js'

export default function AuthScreen() {
  const { theme } = useTheme()
  const [tab, setTab] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showRegPass, setShowRegPass] = useState(false)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  const [regName, setRegName] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPassword, setRegPassword] = useState('')

  const { login, register } = useAuth()
  const { t, lang, setLang } = useLang()
  const cardRef = useRef(null)

  useEffect(() => {
    gsap.fromTo(cardRef.current, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' })
  }, [])

  const switchTab = (newTab) => {
    setTab(newTab)
    setError('')
    gsap.fromTo(cardRef.current, { x: newTab === 'register' ? 12 : -12, opacity: 0.7 }, { x: 0, opacity: 1, duration: 0.22, ease: 'power2.out' })
  }

  const handleLogin = async (e) => {
    e?.preventDefault()
    setError('')
    if (!identifier || !password) { setError(t('auth.error_fields')); return }
    setLoading(true)
    try {
      await login(identifier, password)
      resetStickyMobileZoom()
    } catch (err) {
      setError(err.message || t('auth.error_connection'))
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e?.preventDefault()
    setError('')
    if (!regUsername || !regPhone || !regPassword) {
      setError('Usuario, teléfono y contraseña son obligatorios')
      return
    }
    if (regPassword.length < 6) {
      setError(t('auth.error_password'))
      return
    }
    setLoading(true)
    try {
      await register({
        username: regUsername,
        phone: regPhone,
        fullName: regName,
        password: regPassword,
      })
      resetStickyMobileZoom()
    } catch (err) {
      setError(err.message || t('auth.error_connection'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <div className="lang-switcher">
          {LANGS.map(l => (
            <button key={l.code} className={`lang-btn ${lang === l.code ? 'active' : ''}`} onClick={() => setLang(l.code)}>
              <img src={l.flag} alt={l.alt} style={{ width: 16, height: 11 }} />
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div ref={cardRef} className="auth-card">
        <div className="auth-logo-wrap">
          <img src={theme === 'dark' ? './logo-dark.png' : './logo-light.png'} alt="DataVision" style={{ width: '100%', maxWidth: 360, maxHeight: 110, height: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto 14px' }} />
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => switchTab('login')}>Iniciar sesión</button>
          <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => switchTab('register')}>Crear cuenta</button>
        </div>

        <div className="auth-form-wrap">
          {tab === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">Usuario</label>
                <input className="form-input" type="text" placeholder="tu_usuario" value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña</label>
                <div className="form-input-icon">
                  <input className="form-input" type={showPass ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
                  <button type="button" className="input-icon-btn" onClick={() => setShowPass(v => !v)}>
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && <div className="form-error visible" style={{ marginBottom: 14 }}>{error}</div>}

              <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : null}
                Ingresar
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">Nombre completo</label>
                <input className="form-input" type="text" placeholder="Tu nombre" value={regName} onChange={e => setRegName(e.target.value)} autoComplete="name" />
              </div>
              <div className="form-group">
                <label className="form-label">Usuario</label>
                <input className="form-input" type="text" placeholder="tu_usuario" value={regUsername} onChange={e => setRegUsername(e.target.value)} autoComplete="username" />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-input" type="text" placeholder="+54..." value={regPhone} onChange={e => setRegPhone(e.target.value)} autoComplete="tel" />
              </div>
              <div className="form-group">
                <label className="form-label">Contraseña</label>
                <div className="form-input-icon">
                  <input className="form-input" type={showRegPass ? 'text' : 'password'} placeholder="mínimo 6 caracteres" value={regPassword} onChange={e => setRegPassword(e.target.value)} autoComplete="new-password" />
                  <button type="button" className="input-icon-btn" onClick={() => setShowRegPass(v => !v)}>
                    {showRegPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && <div className="form-error visible" style={{ marginBottom: 14 }}>{error}</div>}

              <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : null}
                Crear cuenta
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
