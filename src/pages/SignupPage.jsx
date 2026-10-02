import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Wheat, ArrowRight, Eye, EyeOff } from 'lucide-react'

export default function SignupPage({ onLogin }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const update = (field) => (e) => {
    setError('')
    setForm({ ...form, [field]: e.target.value })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setError('Passwords do not match')
      return
    }
    setError('')
    setIsLoading(true)
    setTimeout(() => {
      onLogin()
      navigate('/dashboard')
    }, 800)
  }

  return (
    <div className="login-page">
      <div className="login-bg">
        <img src="/satellite-bg.jpg" alt="Satellite view of Punjab farmland" />
        <div className="login-bg-overlay" />
      </div>

      <div className="login-left">
        <h1>Join the Future<br />of Precision Farming.</h1>
        <p className="tagline">
          Create your FasalScan account to access satellite-powered vegetation
          indices, relative risk ranking across management zones, and
          rule-based advisories for field scouting.
        </p>
      </div>

      <div className="login-right">
        <form className="login-card glass-panel" onSubmit={handleSubmit} id="signup-form">
          <div className="login-logo">
            <Wheat size={28} strokeWidth={2.5} />
            <span>FasalScan</span>
          </div>
          <p className="login-subtitle">Create Account</p>

          <div style={{
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '8px',
            padding: '7px 10px',
            marginBottom: '1rem',
            fontSize: '0.72rem',
            color: '#fbbf24',
            lineHeight: 1.35,
            textAlign: 'center',
          }}>
            ℹ️ <strong>Demo Mode:</strong> Mock registration enabled. Enter any details to create a session.
          </div>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '8px',
              padding: '7px 10px',
              marginBottom: '1rem',
              fontSize: '0.75rem',
              color: '#f87171',
              textAlign: 'center',
            }}>
              ⚠️ {error}
            </div>
          )}

          <div className="signup-grid">
            <div className="form-group">
              <label htmlFor="signup-name">Full Name</label>
              <input
                id="signup-name"
                className="form-input"
                type="text"
                placeholder="Rajinder Singh"
                value={form.name}
                onChange={update('name')}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-email">Email</label>
              <input
                id="signup-email"
                className="form-input"
                type="email"
                placeholder="you@farm.co"
                value={form.email}
                onChange={update('email')}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="signup-password">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="signup-password"
                  className="form-input"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={update('password')}
                  required
                  minLength={6}
                  style={{ paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%',
                    transform: 'translateY(-50%)', background: 'none',
                    border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
                    padding: 0, display: 'flex',
                  }}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="signup-confirm">Confirm Password</label>
              <input
                id="signup-confirm"
                className="form-input"
                type="password"
                placeholder="••••••••"
                value={form.confirm}
                onChange={update('confirm')}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-primary"
            id="signup-submit"
            disabled={isLoading}
            style={isLoading ? { opacity: 0.7, cursor: 'not-allowed' } : { marginTop: '0.75rem' }}
          >
            {isLoading ? 'Creating Account...' : (
              <>
                Create Account & Enter
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <p className="login-footer">
            Already have an account?{' '}
            <Link to="/">Log In</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
