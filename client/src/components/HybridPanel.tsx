/**
 * 00_xibalba_alpaca/client/src/components/HybridPanel.tsx
 *
 * Small UI panel to interact with the local Hybrid API bridge.
 * - Enqueues safe commands (build, ci, preview) to the hybrid-agent via POST /api/hybrid/run
 * - Polls GET /api/hybrid/result?id=<id> for result JSON and displays it
 *
 * This file is intentionally self-contained and uses built-in browser fetch.
 */

import React, { useEffect, useRef, useState } from 'react'
import './HybridPanel.css' // optional: if you want to add separate styling later

type RunResponse = { id: string } | { error?: string }
type ResultPayload = {
  id?: string
  cmd?: string
  exitCode?: number
  stdout?: string
  stderr?: string
  startedAt?: string
  finishedAt?: string
  dryRun?: boolean
  error?: string
  [k: string]: any
}

const ALLOWED_COMMANDS: { key: string; label: string; description?: string }[] = [
  { key: 'ci', label: 'npm ci', description: 'Install dependencies' },
  { key: 'build', label: 'npm run build', description: 'Create production build' },
  { key: 'preview', label: 'npm run preview', description: 'Start Vite preview (if available)' },
]

export default function HybridPanel(): JSX.Element {
  const [selected, setSelected] = useState<string>('build')
  const [token, setToken] = useState<string>('')
  const [queuedId, setQueuedId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('idle')
  const [output, setOutput] = useState<string>('')
  const [jsonResult, setJsonResult] = useState<ResultPayload | null>(null)
  const [polling, setPolling] = useState<boolean>(false)
  const pollRef = useRef<number | null>(null)
  const [timeoutMs, setTimeoutMs] = useState<number>(60000) // overall timeout for waiting (ms)

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current)
      }
    }
  }, [])

  async function runCommand(name: string) {
    setStatus('queuing')
    setOutput('')
    setJsonResult(null)
    setQueuedId(null)

    try {
      const res = await fetch('/api/hybrid/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, token: token || undefined }),
      })
      const data = (await res.json()) as RunResponse
      if ('id' in data) {
        setQueuedId(data.id)
        setStatus('queued')
        // start polling for result
        startPolling(data.id)
      } else {
        setStatus('error')
        setOutput(JSON.stringify(data, null, 2))
      }
    } catch (err: any) {
      setStatus('error')
      setOutput(String(err))
    }
  }

  function startPolling(id: string) {
    if (pollRef.current) {
      clearInterval(pollRef.current)
    }
    setPolling(true)
    setStatus('waiting')
    const start = Date.now()

    // poll every 800ms
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/hybrid/result?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
        if (res.status === 200) {
          const txt = await res.text()
          // try parse JSON, else return text
          let parsed: any = txt
          try {
            parsed = JSON.parse(txt)
          } catch {
            parsed = { raw: txt }
          }
          setJsonResult(parsed)
          setOutput(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2))
          setStatus(parsed?.error ? 'error' : 'done')
          stopPolling()
          return
        } else if (res.status === 404) {
          // not ready yet, continue polling
        } else {
          const body = await res.text().catch(() => '')
          setStatus('error')
          setOutput(`Unexpected status ${res.status}\n\n${body}`)
          stopPolling()
          return
        }
      } catch (err: any) {
        // network or CORS issue
        setStatus('error')
        setOutput(String(err))
        stopPolling()
        return
      }

      // timeout check
      if (Date.now() - start > timeoutMs) {
        setStatus('timeout')
        setOutput('Timed out waiting for result.')
        stopPolling()
      }
    }, 800)
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setPolling(false)
  }

  function downloadResult() {
    if (!jsonResult && !output) return
    const data = jsonResult ? JSON.stringify(jsonResult, null, 2) : output
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = queuedId ? `${queuedId}.result.json` : `hybrid-result.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function prettyStatus() {
    switch (status) {
      case 'idle':
        return 'Idle'
      case 'queuing':
        return 'Queuing…'
      case 'queued':
        return `Queued (${queuedId})`
      case 'waiting':
        return 'Waiting for result…'
      case 'done':
        return 'Done'
      case 'timeout':
        return 'Timed out'
      case 'error':
        return 'Error'
      default:
        return status
    }
  }

  return (
    <div style={containerStyle}>
      <h3 style={{ marginTop: 0 }}>Hybrid Panel</h3>

      <div style={rowStyle}>
        <label style={labelStyle}>Action</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6 }}
        >
          {ALLOWED_COMMANDS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>API Token (optional)</label>
        <input
          placeholder="token (if required)"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => runCommand(selected)}
          disabled={polling || status === 'queuing' || status === 'waiting'}
          style={primaryButton}
        >
          Run
        </button>

        <button
          onClick={() => {
            if (queuedId) startPolling(queuedId)
          }}
          disabled={!queuedId || polling}
          style={secondaryButton}
        >
          Poll Result
        </button>

        <button
          onClick={() => {
            stopPolling()
            setStatus('idle')
          }}
          disabled={!polling}
          style={dangerButton}
        >
          Stop
        </button>

        <div style={{ marginLeft: 'auto', alignSelf: 'center', color: '#9aa6b2' }}>
          <strong>Status:</strong> {prettyStatus()}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, color: '#9aa6b2' }}>Result / Output</div>
        <div style={outputBoxStyle}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{output || 'No output yet.'}</pre>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={downloadResult} disabled={!output && !jsonResult} style={secondaryButton}>
            Download result
          </button>
          <button
            onClick={() => {
              setOutput('')
              setJsonResult(null)
              setQueuedId(null)
              setStatus('idle')
            }}
            style={secondaryButton}
          >
            Clear
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, color: '#7f96a6', fontSize: 12 }}>
        Notes:
        <ul style={{ margin: '8px 0 0 18px' }}>
          <li>The server-side bridge exposes a small whitelist of safe activities (build/ci/preview).</li>
          <li>Use a token if your bridge requires it (set HYBRID_API_TOKEN on the bridge process).</li>
          <li>This panel enqueues commands — execution is performed by the hybrid-agent process.</li>
        </ul>
      </div>
    </div>
  )
}

/* Inline styles (small subset). You can move these to a CSS file if you prefer. */

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 820,
  background: 'rgba(6, 12, 18, 0.6)',
  border: '1px solid rgba(255,255,255,0.04)',
  padding: 14,
  borderRadius: 10,
  color: 'var(--text-primary, #e6eef6)',
  boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  marginTop: 8,
}

const labelStyle: React.CSSProperties = {
  width: 120,
  color: 'var(--text-tertiary, #9aa6b2)',
}

const primaryButton: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  background: 'var(--accent, #06b6d4)',
  color: '#061018',
  border: 'none',
  cursor: 'pointer',
  fontWeight: 700,
}

const secondaryButton: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--text-primary, #e6eef6)',
  border: '1px solid rgba(255,255,255,0.06)',
  cursor: 'pointer',
}

const dangerButton: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  background: '#ff6b6b',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
}

const outputBoxStyle: React.CSSProperties = {
  marginTop: 8,
  padding: 12,
  borderRadius: 8,
  background: 'rgba(0,0,0,0.25)',
  minHeight: 140,
  maxHeight: 420,
  overflow: 'auto',
  border: '1px solid rgba(255,255,255,0.02)',
}
