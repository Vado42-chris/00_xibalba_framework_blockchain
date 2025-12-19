/**
 * DESKTOP COMPONENT
 * 
 * Desktop surface that renders windows
 * Handles click-away, keyboard shortcuts
 */

import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Window } from '../window/Window'
import { getWindows, subscribe, getFocusedWindowId, closeFocusedWindow, getWindow, openWindow } from '../../core/window/windowManager'
import { ScratchpadWindow } from '../scratchpad/ScratchpadWindow'
// TODO: Phase 4 - desktop persistence, clipboard, feedback
// import { loadDesk, saveDesk } from '../../core/desktop/persistence'
// import { ClipboardHandler } from '../clipboard/ClipboardHandler'
// import { FeedbackWindow } from '../feedback/FeedbackWindow'
// import { ClipboardWindow } from '../clipboard/ClipboardWindow'

// Stub functions for now (Phase 4)
const FeedbackWindow: React.FC = () => <div>Feedback (Phase 4)</div>
import { WINDOW_DEFAULTS } from '../../core/window/windowDefaults'
import './Desktop.css'

export const Desktop: React.FC = () => {
  const [windows, setWindows] = useState(getWindows())
  const desktopRef = React.useRef<HTMLDivElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'

  // Hydrate desk before first paint
  // TODO: Phase 4 - desktop persistence
  // useLayoutEffect(() => {
  //   try {
  //     const desk = loadDesk()
  //     if (desk) {
  //       hydrateDesk(desk)
  //       setWindows(getWindows())
  //     }
  //   } catch {}
  // }, [])

  // Persist function (memoized)
  // TODO: Phase 4 - desktop persistence
  // const persist = useMemo(
  //   () => () => {
  //     saveDesk(serializeDesk())
  //   },
  //   []
  // )

  // Subscribe to desk changes and persist
  // useLayoutEffect(() => {
  //   return onDeskChanged(persist)
  // }, [persist])

  // Subscribe to window manager changes
  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setWindows(getWindows())
    })
    return unsubscribe
  }, [])

  // Handle opening window from search result (URL params)
  useEffect(() => {
    const openParam = searchParams.get('open')
    const titleParam = searchParams.get('title')
    const typeParam = searchParams.get('type')
    const descParam = searchParams.get('desc')

    if (openParam && titleParam) {
      // Check if window already exists
      const existing = getWindows().find(w => w.id === openParam)
      if (!existing) {
        console.log('[Desktop] Opening window:', { openParam, titleParam, typeParam })
        // Use larger size for scratchpad windows
        const size = typeParam === 'scratchpad' 
          ? { w: 600, h: 500 } 
          : WINDOW_DEFAULTS.sizes.feedback
        const existingWindows = getWindows()
        const stagger = existingWindows.length * 30
        
        // Create content based on result type
        let content: React.ReactNode
        const contentStyle: React.CSSProperties = {
          padding: 0,
          color: 'var(--text-primary)',
          lineHeight: 'var(--leading-relaxed)',
        }
        
        if (typeParam === 'command') {
          content = (
            <div style={contentStyle}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-6)',
                paddingBottom: 'var(--space-4)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(6, 182, 212, 0.2)',
                  border: '2px solid rgba(6, 182, 212, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px'
                }}>
                  ⚡
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ 
                    margin: 0, 
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-2xl)',
                    fontWeight: 'var(--weight-bold)',
                    letterSpacing: '-0.02em',
                    marginBottom: 'var(--space-1)'
                  }}>
                    {titleParam}
                  </h3>
                  <p style={{
                    margin: 0,
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--text-sm)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    COMMAND
                  </p>
                </div>
              </div>
              {descParam && (
                <p style={{ 
                  color: 'var(--text-secondary)', 
                  marginBottom: 'var(--space-6)',
                  fontSize: 'var(--text-base)',
                  lineHeight: 'var(--leading-relaxed)'
                }}>
                  {descParam}
                </p>
              )}
              <div style={{
                padding: 'var(--space-5)',
                background: 'rgba(6, 182, 212, 0.08)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(6, 182, 212, 0.2)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)'
              }}>
                <p style={{ 
                  color: 'var(--text-secondary)', 
                  fontSize: 'var(--text-sm)',
                  margin: 0,
                  lineHeight: 'var(--leading-relaxed)'
                }}>
                  This command would execute in a full implementation. The window system is fully functional—you can drag, resize, and close this window.
                </p>
              </div>
            </div>
          )
        } else if (typeParam === 'file') {
          content = (
            <div style={contentStyle}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-6)',
                paddingBottom: 'var(--space-4)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px'
                }}>
                  📄
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ 
                    margin: 0, 
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-2xl)',
                    fontWeight: 'var(--weight-bold)',
                    letterSpacing: '-0.02em',
                    marginBottom: 'var(--space-1)'
                  }}>
                    {titleParam}
                  </h3>
                  <p style={{
                    margin: 0,
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-family-mono)'
                  }}>
                    {descParam || 'File'}
                  </p>
                </div>
              </div>
              <div style={{
                padding: 'var(--space-6)',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                fontFamily: 'var(--font-family-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                lineHeight: 'var(--leading-relaxed)',
                marginTop: 'var(--space-4)'
              }}>
                <p style={{ margin: 0, marginBottom: 'var(--space-3)', opacity: 0.9 }}>File content would be displayed here.</p>
                <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', opacity: 0.7 }}>In a full implementation, this would show the actual file contents.</p>
              </div>
            </div>
          )
        } else if (typeParam === 'scratchpad') {
          // Scratchpad window - persistent text editor
          // Content is rendered by ScratchpadWindow component
          content = <ScratchpadWindow id={openParam} />
        } else {
          content = (
            <div style={contentStyle}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-6)',
                paddingBottom: 'var(--space-4)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px'
                }}>
                  📝
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ 
                    margin: 0, 
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-2xl)',
                    fontWeight: 'var(--weight-bold)',
                    letterSpacing: '-0.02em',
                    marginBottom: 'var(--space-1)'
                  }}>
                    {titleParam}
                  </h3>
                  <p style={{
                    margin: 0,
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--text-sm)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    CONTENT
                  </p>
                </div>
              </div>
              {descParam && (
                <div style={{
                  padding: 'var(--space-6)',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  marginTop: 'var(--space-4)'
                }}>
                  <p style={{ 
                    color: 'var(--text-secondary)', 
                    lineHeight: 'var(--leading-relaxed)',
                    fontSize: 'var(--text-base)',
                    margin: 0,
                    opacity: 0.9
                  }}>
                    {descParam}
                  </p>
                </div>
              )}
            </div>
          )
        }

        openWindow({
          id: openParam,
          title: titleParam,
          position: { 
            x: WINDOW_DEFAULTS.positions.first.x + stagger, 
            y: WINDOW_DEFAULTS.positions.first.y + stagger 
          },
          size,
          content,
        })

        // Clear URL params after opening
        setSearchParams({})
      } else {
        // Window exists, just focus it and clear params
        const window = getWindow(openParam)
        if (window) {
          window.state = 'FOCUSED'
          window.zIndex = Math.max(...getWindows().map(w => w.zIndex)) + 1
          setWindows(getWindows())
        }
        setSearchParams({})
      }
    }
  }, [searchParams, setSearchParams])

  // Handle click-away (blur focused window)
  const handleDesktopClick = (e: React.MouseEvent) => {
    // Only blur if clicking directly on desktop (not a window or button)
    const target = e.target as HTMLElement
    if (target === desktopRef.current || target.classList.contains('desktop')) {
      const focusedId = getFocusedWindowId()
      if (focusedId) {
        const focusedWindow = getWindow(focusedId)
        if (focusedWindow && focusedWindow.state === 'FOCUSED') {
          focusedWindow.state = 'BLURRED'
          setWindows(getWindows())
        }
      }
    }
  }

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC closes focused window
      if (e.key === 'Escape') {
        closeFocusedWindow()
      }
    }

    globalThis.addEventListener('keydown', handleKeyDown)
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  // Handle new window launcher - opens Feedback window by default
  const handleNewWindow = () => {
    const size = WINDOW_DEFAULTS.sizes.feedback
    const existingWindows = getWindows()
    // Stagger position based on number of windows
    const stagger = existingWindows.length * 30
    openWindow({
      id: `feedback-${Date.now()}`,
      title: 'Feedback',
      position: { 
        x: WINDOW_DEFAULTS.positions.first.x + stagger, 
        y: WINDOW_DEFAULTS.positions.first.y + stagger 
      },
      size,
      content: <FeedbackWindow />,
    })
  }

  // Clear cursor when pointer is not over any window (desktop-level)
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      // Check if pointer is over any window
      const allWindows = document.querySelectorAll('.window')
      let isOverAnyWindow = false
      
      for (const windowEl of allWindows) {
        const rect = windowEl.getBoundingClientRect()
        const { clientX: x, clientY: y } = e
        if (x >= rect.left && x <= rect.right && 
            y >= rect.top && y <= rect.bottom) {
          isOverAnyWindow = true
          break
        }
      }
      
      // Clear cursor if not over any window
      if (!isOverAnyWindow) {
        document.body.style.cursor = ''
      }
    }

    globalThis.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      globalThis.removeEventListener('pointermove', handlePointerMove)
    }
  }, [])

  return (
    <>
      {/* TODO: Phase 4 - ClipboardHandler */}
      <div
        ref={desktopRef}
        className="desktop"
        onClick={handleDesktopClick}
      >
        {/* Private context cue - subtle, non-intrusive */}
        <div className="desktop-context-cue">
          <span className="desktop-context-text">
            {isDemo ? 'Demo Workspace' : 'Your workspace'}
          </span>
        </div>
        
        {/* Demo Mode indicator - visible only in demo sessions */}
        {isDemo && (
          <div className="desktop-demo-indicator">
            <span className="desktop-demo-text">Demo Mode</span>
          </div>
        )}
        
        {windows.length === 0 ? (
          <div className="empty-state">
            <p style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-3)' }}>Search to open a scratchpad.</p>
            <p className="subtle">Everything here stays local.</p>
            <p className="subtle" style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-xs)', opacity: 0.5 }}>
              Type "/" to focus search, or click the + button.
            </p>
          </div>
        ) : (
          windows.map(window => (
            <Window key={window.id} window={window} />
          ))
        )}
        
        {/* Launcher button */}
        <button
          className="desktop-launcher-button"
          onClick={handleNewWindow}
          aria-label="New Window"
          title="New Window (or press +)"
        >
          +
        </button>
      </div>
    </>
  )
}
