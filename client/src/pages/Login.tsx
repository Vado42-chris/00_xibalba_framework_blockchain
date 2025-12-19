import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

const containerStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: '48px auto',
  padding: 24,
  borderRadius: 12,
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.04)',
  color: 'var(--text-primary, #e6eef6)',
  fontFamily:
    'var(--font-family, Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial)',
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginBottom: 16,
}

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-tertiary, #9aa6b2)',
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.06)',
  background: 'transparent',
  color: 'var(--text-primary, #e6eef6)',
  outline: 'none',
  fontSize: 14,
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  background: 'var(--accent, #06b6d4)',
  color: '#061218',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 600,
}

const footerStyle: React.CSSProperties = {
  marginTop: 16,
  color: 'var(--text-tertiary, #9aa6b2)',
  fontSize: 13,
}

const Login: React.FC = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (!email || !password) {
      setError('Please enter both email and password.')
      return
    }

    setLoading(true)

    // NOTE: This is a placeholder login flow.
    // In a real deployment you would POST to your API and handle auth tokens.
    // Here we simulate success for any non-empty credentials and redirect to /desktop.

    try {
      await new Promise((res) => setTimeout(res, 700)) // simulate network
      // simple demo validation
      if (password.length < 3) {
        setError('Password too short for demo (min 3 chars).')
        setLoading(false)
        return
      }

      setNotice('Demo sign-in successful. Redirecting…')
      setTimeout(() => {
        navigate('/desktop')
      }, 700)
    } catch (err) {
      setError('Unexpected error during sign-in. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Sign in</h1>
      <p style={{ marginTop: 8, color: 'var(--text-tertiary, #9aa6b2)' }}>
        Use this placeholder login to open the Desktop route in demo mode.
      </p>

      <form onSubmit={handleSubmit} aria-label="Login form" style={{ marginTop: 18 }}>
        <div style={fieldStyle}>
          <label htmlFor="email" style={labelStyle}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
            autoComplete="username"
            required
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="password" style={labelStyle}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="demo password"
            style={inputStyle}
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <div role="alert" style={{ color: '#ff6b6b', marginBottom: 12 }}>
            {error}
          </div>
        )}

        {notice && (
          <div role="status" style={{ color: 'var(--text-secondary, #cfeef6)', marginBottom: 12 }}>
            {notice}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in (demo)'}
          </button>

          <button
            type="button"
            onClick={() => {
              // quick demo: open desktop with demo param
              navigate('/desktop?demo=true')
            }}
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid rgba(255,255,255,0.06)',
              cursor: 'pointer',
            }}
          >
            Open demo desktop
          </button>
        </div>
      </form>

      <div style={footerStyle}>
        <div>
          <small>
            No real authentication is performed in this build. To change this behavior, connect the form to your backend
            authentication endpoint.
          </small>
        </div>
        <div style={{ marginTop: 8 }}>
          <Link to="/" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Login
