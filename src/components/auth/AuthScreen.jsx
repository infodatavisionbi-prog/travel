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
  const [tab, setTab]               = useState('login')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [showPass, setShowPass]     = useState(false)
  const [showRegPass, setShowRegPass] = useState(false)

  // Login fields
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')

  // Register fields
  const [regName, setRegName]       = useState('')
  const [regCompany, setRegCompany] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail]     = useState('')
  const [regPassword, setRegPassword] = useState('')

  const { login, register }         = useAuth()
  const { t, lang, setLang }        = useLang()
  const cardRef                     = useRef(null)

  useEffect(() => {
    gsap.fromTo(cardRef.current,
      { y: 28, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }
    )
  }, [])

  const switchTab = (newTab) => {
    setTab(newTab)
    setError('')
    gsap.fromTo(cardRef.current,
      { x: newTab === 'register' ? 12 : -12, opacity: 0.7 },
      { x: 0, opacity: 1, duration: 0.22, ease: 'power2.out' }
    )
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
    if (!regName || !regCompany || !regUsername || !regEmail || !regPassword) {
      setError(t('auth.error_fields')); return
    }
    if (regPassword.length < 6) {
      setError(t('auth.error_password')); return
    }
    setLoading(true)
    try {
      await register({
        email:       regEmail,
        password:    regPassword,
        fullName:    regName,
        companyName: regCompany,
        username:    regUsername,
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
      {/* Language switcher top-right */}
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <div className="lang-switcher">
          {LANGS.map(l => (
            <button
              key={l.code}
              className={`lang-btn ${lang === l.code ? 'active' : ''}`}
              onClick={() => setLang(l.code)}
            >
              <img src={l.flag} alt={l.alt} style={{ width: 16, height: 11 }} />
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Card */}
      <div ref={cardRef} className="auth-card">
        {/* Logo */}
        <div className="auth-logo-wrap">
          <img
            src={theme === 'dark' ? './logo-dark.png' : './logo-light.png'}
            alt="DataVision"
            style={{ width: '100%', maxWidth: 360, maxHeight: 110, height: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto 14px' }}
          />
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
          >
            {t('auth.login_tab')}
          </button>
          <button
            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => switchTab('register')}
          >
            {t('auth.register_tab')}
          </button>
        </div>

        {/* Form */}
        <div className="auth-form-wrap">
          {tab === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">{t('auth.username')}</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder={t('auth.username_placeholder')}
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('auth.password')}</label>
                <div className="form-input-icon">
                  <input
                    className="form-input"
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="input-icon-btn"
                    onClick={() => setShowPass(v => !v)}
                    title={showPass ? t('auth.hide_password') : t('auth.show_password')}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="form-error visible" style={{ marginBottom: 14 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={loading}
              >
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : null}
                {t('auth.login_btn')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label className="form-label">{t('auth.full_name')}</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder={t('auth.name_placeholder')}
                  value={regName}
                  onChange={e => setRegName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('auth.company')}</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder={t('auth.company_placeholder')}
                  value={regCompany}
                  onChange={e => setRegCompany(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('auth.username')}</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder={t('auth.username_placeholder')}
                  value={regUsername}
                  onChange={e => setRegUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('auth.email')}</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder={t('auth.email_placeholder')}
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('auth.password')}</label>
                <div className="form-input-icon">
                  <input
                    className="form-input"
                    type={showRegPass ? 'text' : 'password'}
                    placeholder={t('auth.password_hint')}
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="input-icon-btn"
                    onClick={() => setShowRegPass(v => !v)}
                  >
                    {showRegPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="form-error visible" style={{ marginBottom: 14 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={loading}
              >
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : null}
                {t('auth.register_btn')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
