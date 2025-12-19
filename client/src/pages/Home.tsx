import React from 'react'
import { Link } from 'react-router-dom'

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
  alignItems: 'flex-start',
  maxWidth: '900px',
  margin: '0 auto',
  padding: '28px',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.8rem',
  fontWeight: 700,
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--text-tertiary, #9aa6b2)',
}

const linkListStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
}

const ctaStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--accent, #06b6d4)',
  color: '#0b1020',
  borderRadius: 8,
  textDecoration: 'none',
  fontWeight: 600,
}

const Home: React.FC = () => {
  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Xibalba Alpaca</h1>
          <p style={subtitleStyle}>A lightweight desktop-like UI. Placeholder home page.</p>
        </div>
      </header>

      <section>
        <p>
          This is the placeholder Home page for the Xibalba Alpaca UI. The application is component-driven
          and uses a small window manager to render draggable/closable windows inside the desktop view.
        </p>

        <div style={linkListStyle}>
          <Link to="/desktop" style={ctaStyle} aria-label="Open Desktop">
            Open Desktop
          </Link>
          <Link to="/search" style={{ ...ctaStyle, background: 'transparent', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-primary)' }}>
            Search
          </Link>
          <Link to="/login" style={{ color: 'var(--text-tertiary)', alignSelf: 'center', textDecoration: 'underline' }}>
            Sign in
          </Link>
        </div>
      </section>

      <section>
        <h2 style={{ marginTop: 12 }}>Quick status</h2>
        <ul>
          <li>Build: placeholder</li>
          <li>Routes: /, /desktop, /search, /login</li>
          <li>Use the Desktop route to test windows and interactions.</li>
        </ul>
      </section>

      <footer style={{ marginTop: 20, color: 'var(--text-tertiary)' }}>
        <small>If you see this page on your live site, the frontend build is working — next step: upload static files to your webroot.</small>
      </footer>
    </div>
  )
}

export default Home
