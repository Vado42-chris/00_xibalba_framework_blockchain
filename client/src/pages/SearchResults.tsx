import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'

type Result = {
  id: string
  title: string
  snippet?: string
  type?: 'file' | 'command' | 'note'
}

/**
 * Placeholder Search Results page
 *
 * - Reads `q` from the query string and shows mock results.
 * - Provides links back to Home and to open the Desktop route.
 * - This file is intentionally self-contained and safe for initial builds.
 */

const containerStyle: React.CSSProperties = {
  maxWidth: 980,
  margin: '28px auto',
  padding: '20px',
  color: 'var(--text-primary, #e6eef6)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 18,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.06)',
  background: 'transparent',
  color: 'var(--text-primary, #e6eef6)',
}

const resultStyle: React.CSSProperties = {
  padding: '14px',
  marginBottom: 12,
  borderRadius: 10,
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.03)',
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1.05rem',
  fontWeight: 600,
}

const snippetStyle: React.CSSProperties = {
  marginTop: 8,
  color: 'var(--text-secondary, #cfeef6)',
  fontSize: '0.95rem',
}

/**
 * Returns a small set of mock search results derived from the query.
 */
function generateMockResults(q: string | null): Result[] {
  if (!q) {
    return []
  }

  const base = q.trim() || 'demo'
  return [
    {
      id: `cmd-${base}-1`,
      title: `Run command: ${base}`,
      snippet: `Simulated command result for "${base}". This would execute in a full implementation.`,
      type: 'command',
    },
    {
      id: `note-${base}-1`,
      title: `Note: ${base} overview`,
      snippet: `A short note or summary matching "${base}". Useful for documentation or quick reference.`,
      type: 'note',
    },
    {
      id: `file-${base}-1`,
      title: `File: ${base}.md`,
      snippet: `Example file contents for ${base}. Click to open in a file window (in the full app).`,
      type: 'file',
    },
  ]
}

const SearchResults: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') || ''

  const results = React.useMemo(() => generateMockResults(q), [q])

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const form = e.currentTarget as HTMLFormElement
              const input = form.querySelector('input[name="q"]') as HTMLInputElement
              setSearchParams(input.value ? { q: input.value } : {})
            }}
            style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}
          >
            <input
              name="q"
              defaultValue={q}
              placeholder="Search… (try: demo, test, notes)"
              aria-label="Search query"
              style={inputStyle}
            />
            <button
              type="submit"
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--accent, #06b6d4)',
                color: '#061218',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Search
            </button>
          </form>
        </div>

        <div style={{ marginLeft: 12 }}>
          <Link to="/" style={{ color: 'var(--text-tertiary, #9aa6b2)', textDecoration: 'underline' }}>
            Home
          </Link>
        </div>
      </div>

      <section aria-live="polite" style={{ marginTop: 6 }}>
        <h2 style={{ margin: '6px 0 12px 0' }}>
          Results {q ? `for "${q}"` : '(no query)'}
        </h2>

        {results.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary, #9aa6b2)' }}>
            No results. Try entering a search term above or open the desktop demo.
            <div style={{ marginTop: 12 }}>
              <Link
                to="/desktop?demo=true"
                style={{
                  display: 'inline-block',
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  textDecoration: 'none',
                }}
              >
                Open demo desktop
              </Link>
            </div>
          </div>
        ) : (
          <div>
            {results.map((r) => (
              <article key={r.id} style={resultStyle} aria-labelledby={`title-${r.id}`}>
                <h3 id={`title-${r.id}`} style={titleStyle}>
                  {r.title}{' '}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary, #9aa6b2)', fontWeight: 500 }}>
                    {r.type?.toUpperCase()}
                  </span>
                </h3>
                {r.snippet && <p style={snippetStyle}>{r.snippet}</p>}

                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <Link
                    to={`/desktop?open=${encodeURIComponent(r.id)}&title=${encodeURIComponent(
                      r.title
                    )}&type=${encodeURIComponent(r.type || '')}&desc=${encodeURIComponent(r.snippet || '')}`}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'var(--accent, #06b6d4)',
                      color: '#061218',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                  >
                    Open in Desktop
                  </Link>

                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      // Placeholder share action
                      alert(`Share link (placeholder): ${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(q)}`)
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'transparent',
                      color: 'var(--text-tertiary, #9aa6b2)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      textDecoration: 'none',
                    }}
                  >
                    Share
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default SearchResults
