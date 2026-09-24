import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Wheat, ArrowRight, Satellite, BarChart3, Shield, Eye, EyeOff } from 'lucide-react'

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    setIsLoading(true)
    // Mocked auth — accept anything
    setTimeout(() => {
      onLogin()
      navigate('/dashboard')
    }, 800)
  }

  return (
    <div className="login-page">
      {/* Background */}
      <div className="login-bg">
        <img src="/satellite-bg.jpg" alt="Satellite view of Punjab farmland" />
        <div className="login-bg-overlay" />
      </div>

      {/* Left branding */}
      <div className="login-left">
        <h1>Crop Stress Intelligence,<br />From Space.</h1>
        <p className="tagline">
          Monitor crop health with satellite-powered NDVI, NDRE, and NDMI analytics.
          Flag possible water stress and other stress types for field scouting.
        </p>
        <div className="login-features">
          <div className="login-feature">
            <div className="icon-circle">
              <Satellite size={18} />
            </div>
            <span>Sentinel-2 satellite imagery, updated every 5 days</span>
          </div>
          <div className="login-feature">
            <div className="icon-circle">
              <BarChart3 size={18} />
            </div>
            <span>NDVI, NDRE, NDMI & composite stress analysis</span>
          </div>
          <div className="login-feature">
            <div className="icon-circle">
              <Shield size={18} />
            </div>
            <span>Relative risk ranking with yield-risk indexing</span>
          </div>
        </div>
      </div>

      {/* Right login card */}
      <div className="login-right">
        <form className="login-card glass-panel" onSubmit={handleSubmit} id="login-form">
          <div className="login-logo">
            <Wheat size={28} strokeWidth={2.5} />
            <span>FasalScan</span>
          </div>
          <p className="login-subtitle">Crop Stress Intelligence</p>

          <div className="form-group">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="form-input"
              type="email"
              placeholder="you@farm.co"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="login-password"
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                }}
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            id="login-submit"
            disabled={isLoading}
            style={isLoading ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
          >
            {isLoading ? (
              <>
                <span className="spinner" style={{
                  width: 16, height: 16,
                  border: '2px solid rgba(2,6,23,0.3)',
                  borderTop: '2px solid var(--bg-primary)',
                  borderRadius: '50%',
                  animation: 'spin 0.6s linear infinite',
                  display: 'inline-block',
                }} />
                Authenticating...
              </>
            ) : (
              <>
                Access Dashboard
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <p className="login-footer">
            Don't have an account?{' '}
            <Link to="/signup">Sign Up</Link>
          </p>
        </form>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
