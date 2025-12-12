/**
 * DESKTOP COMPONENT
 * 
 * Desktop surface that renders windows
 * Handles click-away, keyboard shortcuts
 */

import React, { useEffect, useState } from 'react'
import { Window } from '../window/Window'
import { getWindows, subscribe, getFocusedWindowId, closeFocusedWindow, getWindow, openWindow } from '../../core/window/windowManager'
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
        {windows.map(window => (
          <Window key={window.id} window={window} />
        ))}
        
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
