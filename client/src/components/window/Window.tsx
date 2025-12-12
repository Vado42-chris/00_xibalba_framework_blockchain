/**
 * WINDOW COMPONENT
 * 
 * Individual window with titlebar, drag, close
 * Static mode - no animations
 */

import React, { useRef, useEffect } from 'react'
import { WindowEntity } from '../../core/window/windowTypes'
import { focusWindow, closeWindow, startDrag, endDrag, moveWindow, getWindows } from '../../core/window/windowManager'
// import { paste, type ClipboardData } from '../../core/clipboard/clipboardManager' // TODO: Phase 4
import './Window.css'

interface WindowProps {
  window: WindowEntity
}

// Spatial semantics: location = command (S3.CN.01 v2)
type SpatialZone = 'TITLE_BAR' | 'CONTENT' | 'RESIZE_EDGE' | 'CLOSE_BUTTON' | 'NONE'

export const Window: React.FC<WindowProps> = ({ window }) => {
  const windowRef = useRef<HTMLDivElement>(null)
  const titlebarRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const activeCommandRef = useRef<'DRAG' | 'SELECT' | 'RESIZE' | null>(null)
  // Store drag handler references for proper cleanup
  const dragMoveHandlerRef = useRef<((e: PointerEvent) => void) | null>(null)
  const dragUpHandlerRef = useRef<(() => void) | null>(null)

  const isFocused = window.state === 'FOCUSED' || window.state === 'DRAGGING'

  // Spatial semantics: determine zone from coordinates (visual geometry)
  // This is the single source of truth for spatial zone calculation
  const getSpatialZone = (x: number, y: number): SpatialZone => {
    if (!windowRef.current) return 'NONE'
    const rect = windowRef.current.getBoundingClientRect()
    
    // Resize edge zone: 8px from visual boundary (calculated first, most specific)
    const RESIZE_ZONE = 8
    const isOnLeftEdge = x >= rect.left && x <= rect.left + RESIZE_ZONE
    const isOnRightEdge = x >= rect.right - RESIZE_ZONE && x <= rect.right
    const isOnTopEdge = y >= rect.top && y <= rect.top + RESIZE_ZONE
    const isOnBottomEdge = y >= rect.bottom - RESIZE_ZONE && y <= rect.bottom
    
    if (isOnLeftEdge || isOnRightEdge || isOnTopEdge || isOnBottomEdge) {
      return 'RESIZE_EDGE'
    }
    
    // Title bar zone: use actual rendered height (visual geometry is law)
    const titlebarHeight = titlebarRef.current 
      ? titlebarRef.current.getBoundingClientRect().height 
      : 44 // Fallback if ref not available
    if (y >= rect.top && y <= rect.top + titlebarHeight) {
      // Check if on close button (16px hit radius from center)
      if (titlebarRef.current) {
        const closeBtn = titlebarRef.current.querySelector('.window-close') as HTMLElement
        if (closeBtn) {
          const closeRect = closeBtn.getBoundingClientRect()
          const closeCenterX = closeRect.left + closeRect.width / 2
          const closeCenterY = closeRect.top + closeRect.height / 2
          const distance = Math.sqrt(
            Math.pow(x - closeCenterX, 2) + Math.pow(y - closeCenterY, 2)
          )
          if (distance <= 16) { // 16px hit radius from center
            return 'CLOSE_BUTTON'
          }
        }
      }
      return 'TITLE_BAR'
    }
    
    // Content zone: everything else
    return 'CONTENT'
  }

  // Handle pointer down - location = command (spatial semantics)
  // This is the single source of truth for all pointer interactions
  const handlePointerDown = (e: React.PointerEvent) => {
    // Clean up any previous command state (defensive)
    if (activeCommandRef.current === 'DRAG') {
      endDrag(window.id)
    }
    
    const zone = getSpatialZone(e.clientX, e.clientY)
    
    if (zone === 'TITLE_BAR') {
      // Location = DRAG command (immediate, no threshold, no state machine)
      e.preventDefault()
      e.stopPropagation()
      focusWindow(window.id)
      activeCommandRef.current = 'DRAG'
      
      if (windowRef.current) {
        const rect = windowRef.current.getBoundingClientRect()
        dragStartRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        }
        startDrag(window.id)
        
        // Clean up any existing drag listeners first (defensive)
        if (dragMoveHandlerRef.current) {
          globalThis.removeEventListener('pointermove', dragMoveHandlerRef.current)
        }
        if (dragUpHandlerRef.current) {
          globalThis.removeEventListener('pointerup', dragUpHandlerRef.current)
        }
        
        // Attach drag listeners immediately (synchronous, no race condition)
        const handlePointerMove = (e: PointerEvent) => {
          // Spatial semantics: execute the command, don't check or change it
          if (activeCommandRef.current === 'DRAG' && dragStartRef.current) {
            // Execute drag command immediately
            const newX = e.clientX - dragStartRef.current.x
            const newY = e.clientY - dragStartRef.current.y
            
            // Clamp to viewport
            const padding = 20
            const maxX = globalThis.innerWidth - window.size.w - padding
            const maxY = globalThis.innerHeight - window.size.h - padding
            const clampedX = Math.max(padding, Math.min(newX, maxX))
            const clampedY = Math.max(padding, Math.min(newY, maxY))
            
            moveWindow(window.id, clampedX, clampedY)
            document.body.style.cursor = 'grabbing'
          }
        }

        const handlePointerUp = () => {
          // Clean up command state
          const wasDragging = activeCommandRef.current === 'DRAG'
          dragStartRef.current = null
          activeCommandRef.current = null
          document.body.style.cursor = ''
          
          // Remove listeners using stored references
          if (dragMoveHandlerRef.current) {
            globalThis.removeEventListener('pointermove', dragMoveHandlerRef.current)
            dragMoveHandlerRef.current = null
          }
          if (dragUpHandlerRef.current) {
            globalThis.removeEventListener('pointerup', dragUpHandlerRef.current)
            dragUpHandlerRef.current = null
          }
          
          if (wasDragging && window.state === 'DRAGGING') {
            endDrag(window.id)
          }
        }

        // Store handler references for proper cleanup
        dragMoveHandlerRef.current = handlePointerMove
        dragUpHandlerRef.current = handlePointerUp

        // Attach global listeners immediately (synchronous attachment)
        globalThis.addEventListener('pointermove', handlePointerMove, { passive: false })
        globalThis.addEventListener('pointerup', handlePointerUp)
      }
    } else if (zone === 'CLOSE_BUTTON') {
      // Location = CLOSE command (immediate execution)
      e.preventDefault()
      e.stopPropagation()
      closeWindow(window.id)
      // No command state needed - action is complete
    } else if (zone === 'RESIZE_EDGE') {
      // Location = RESIZE command (future implementation)
      e.preventDefault()
      e.stopPropagation()
      activeCommandRef.current = 'RESIZE'
      // Resize logic would go here
    } else if (zone === 'CONTENT') {
      // Location = SELECT or FOCUS command
      // Check if clicking on text-selectable element (spatial semantics: location defines command)
      const target = e.target as HTMLElement
      if (target) {
        const computed = globalThis.window.getComputedStyle(target)
        
        // If text-selectable, allow selection (browser handles it natively)
        if (computed.userSelect !== 'none' && 
            (target.tagName === 'P' || target.tagName === 'SPAN' || target.tagName === 'DIV' || 
             target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
          activeCommandRef.current = 'SELECT'
          // Don't prevent default - allow browser text selection
          // Don't stop propagation - let browser handle selection
          return
        }
      }
      
      // Otherwise, focus the window (spatial semantics: content area = focus command)
      e.preventDefault()
      focusWindow(window.id)
      activeCommandRef.current = null
    }
  }

  // Execute active command on pointer move (no state changes, only execution)
  // Listeners are attached synchronously in handlePointerDown, not in useEffect
  // This eliminates race conditions and ensures immediate response
  useEffect(() => {
    // This effect only cleans up listeners when component unmounts
    // Actual listener attachment happens in handlePointerDown for immediate response
    return () => {
      // Clean up any lingering cursor state
      document.body.style.cursor = ''
    }
  }, [])

  // Cursor updates based on spatial geometry (visual reality, not DOM)
  useEffect(() => {
    const updateCursor = (e: PointerEvent) => {
      if (!windowRef.current) {
        document.body.style.cursor = ''
        return
      }
      
      // Calculate spatial zone from visual geometry (not DOM)
      const rect = windowRef.current.getBoundingClientRect()
      const { clientX: x, clientY: y } = e
      
      // Resize edge zone: 8px from visual boundary (calculated first, most specific)
      const RESIZE_ZONE = 8
      const isOnLeftEdge = x >= rect.left && x <= rect.left + RESIZE_ZONE
      const isOnRightEdge = x >= rect.right - RESIZE_ZONE && x <= rect.right
      const isOnTopEdge = y >= rect.top && y <= rect.top + RESIZE_ZONE
      const isOnBottomEdge = y >= rect.bottom - RESIZE_ZONE && y <= rect.bottom
      
      // Edge detection first (spatial semantics: visual boundary is law)
      if (isOnLeftEdge || isOnRightEdge || isOnTopEdge || isOnBottomEdge) {
        // Determine specific edge cursor (use the variables we just calculated)
        if ((isOnTopEdge && isOnLeftEdge) || (isOnBottomEdge && isOnRightEdge)) {
          document.body.style.cursor = 'nwse-resize'
        } else if ((isOnTopEdge && isOnRightEdge) || (isOnBottomEdge && isOnLeftEdge)) {
          document.body.style.cursor = 'nesw-resize'
        } else if (isOnLeftEdge || isOnRightEdge) {
          document.body.style.cursor = 'ew-resize'
        } else if (isOnTopEdge || isOnBottomEdge) {
          document.body.style.cursor = 'ns-resize'
        } else {
          document.body.style.cursor = 'default'
        }
        return
      }
      
      // Title bar zone: use actual rendered height (visual geometry is law)
      const titlebarHeight = titlebarRef.current 
        ? titlebarRef.current.getBoundingClientRect().height 
        : 44 // Fallback if ref not available
      if (y >= rect.top && y <= rect.top + titlebarHeight) {
        // Check if on close button (16px hit radius from center)
        if (titlebarRef.current) {
          const closeBtn = titlebarRef.current.querySelector('.window-close') as HTMLElement
          if (closeBtn) {
            const closeRect = closeBtn.getBoundingClientRect()
            const closeCenterX = closeRect.left + closeRect.width / 2
            const closeCenterY = closeRect.top + closeRect.height / 2
            const distance = Math.sqrt(
              Math.pow(x - closeCenterX, 2) + Math.pow(y - closeCenterY, 2)
            )
            if (distance <= 16) { // 16px hit radius from center
              document.body.style.cursor = 'pointer'
              return
            }
          }
        }
        // Title bar (not close button)
        document.body.style.cursor = activeCommandRef.current === 'DRAG' ? 'grabbing' : 'grab'
        return
      }
      
      // Content zone: everything else
      // Default cursor for content (text selection is handled by browser natively)
      // We don't use elementFromPoint - that was the "ghost cursor" defect
      // Content area is default; browser will show text cursor when over selectable text
      document.body.style.cursor = 'default'
    }

    const handlePointerMove = (e: PointerEvent) => {
      // Only update cursor if pointer is over this window AND it's topmost
      // Spatial semantics: visual geometry is law, but z-order matters for coordination
      if (!windowRef.current) return
      
      const rect = windowRef.current.getBoundingClientRect()
      const { clientX: x, clientY: y } = e
      
      // Check if pointer is within window bounds (visual geometry, not DOM)
      const isOverWindow = x >= rect.left && x <= rect.right && 
                          y >= rect.top && y <= rect.bottom
      
      if (!isOverWindow) {
        return // Pointer not over this window
      }
      
      // Check if this window is topmost (highest z-index) at this pointer location
      // This prevents multiple windows from fighting over cursor updates
      // Optimized: Only check windows with higher z-index (early exit)
      const allWindows = getWindows()
      let isTopmost = true
      const thisZ = window.zIndex
      
      // Quick check: if this window has the highest z-index, it's always topmost
      const maxZ = Math.max(...allWindows.map(w => w.zIndex))
      if (thisZ === maxZ) {
        // This window is topmost - update cursor immediately
        updateCursor(e)
        return
      }
      
      // Otherwise, check if any window with higher z-index is under the pointer
      for (const otherWindow of allWindows) {
        if (otherWindow.id === window.id || otherWindow.zIndex <= thisZ) continue
        
        // Get other window's DOM element (cached lookup)
        const otherElement = document.querySelector(`[data-window-id="${otherWindow.id}"]`) as HTMLElement
        if (!otherElement) continue
        
        const otherRect = otherElement.getBoundingClientRect()
        
        // If other window is on top (higher z-index) and pointer is over it
        const isOverOther = x >= otherRect.left && x <= otherRect.right && 
                           y >= otherRect.top && y <= otherRect.bottom
        if (isOverOther) {
          isTopmost = false
          break
        }
      }
      
      // Only update cursor if this window is topmost
      if (isTopmost) {
        updateCursor(e)
      }
    }

    // Attach listener with capture phase for immediate updates
    // All windows listen, but only topmost updates cursor
    globalThis.addEventListener('pointermove', handlePointerMove, { passive: true, capture: true })
    
    return () => {
      globalThis.removeEventListener('pointermove', handlePointerMove, true)
    }
  }, [window.zIndex])

  // Close button handled by spatial semantics in handlePointerDown - no separate handler needed

  // Handle paste events when window is focused
  useEffect(() => {
    if (window.state !== 'FOCUSED') return

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      let handled = false

      for (const item of items) {
        // Handle image paste
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            handled = true
            // Dispatch custom event for window content to handle
            const windowElement = windowRef.current
            if (windowElement) {
              windowElement.dispatchEvent(
                new CustomEvent('window-paste', {
                  detail: { format: 'image', file },
                  bubbles: true,
                })
              )
            }
            break
          }
        }

        // Handle text paste
        if (item.type === 'text/plain') {
          item.getAsString((text) => {
            if (text && text.trim()) {
              e.preventDefault()
              handled = true
              const windowElement = windowRef.current
              if (windowElement) {
                windowElement.dispatchEvent(
                  new CustomEvent('window-paste', {
                    detail: { format: 'text', text },
                    bubbles: true,
                  })
                )
              }
            }
          })
          if (handled) break
        }
      }

      // If no items handled, try clipboard API
      // TODO: Phase 4 - clipboard manager
      // if (!handled) {
      //   const clipboardData = await paste()
      //   if (clipboardData) {
      //     e.preventDefault()
      //     const windowElement = windowRef.current
      //     if (windowElement) {
      //       windowElement.dispatchEvent(
      //         new CustomEvent('window-paste', {
      //           detail: clipboardData,
      //           bubbles: true,
      //         })
      //       )
      //     }
      //   }
      // }
    }

    const windowElement = windowRef.current
    const contentElement = windowElement?.querySelector('.window-content') as HTMLElement
    
    if (windowElement && contentElement) {
      // Add paste listener to window element
      windowElement.addEventListener('paste', handlePaste)
      // Make content focusable for paste events
      contentElement.setAttribute('tabindex', '-1')
      // Focus content when window becomes focused (with slight delay for smooth UX)
      if (isFocused) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          contentElement.focus()
        })
      }
      return () => {
        windowElement.removeEventListener('paste', handlePaste)
      }
    }
  }, [window.state, window.id, isFocused])

  return (
    <div
      ref={windowRef}
      className={`window ${isFocused ? 'window-focused' : 'window-blurred'}`}
      data-window-id={window.id}
      style={{
        position: 'absolute',
        left: `${window.position.x}px`,
        top: `${window.position.y}px`,
        width: `${window.size.w}px`,
        height: `${window.size.h}px`,
        zIndex: window.zIndex,
      }}
      onPointerDown={handlePointerDown}
    >
      <div
        ref={titlebarRef}
        className="window-titlebar"
      >
        <span className="window-title">{window.title}</span>
        <button
          className="window-close"
          aria-label="Close window"
        >
          ×
        </button>
      </div>
      <div 
        className="window-content"
        tabIndex={-1}
        style={{ outline: 'none' }}
      >
        {window.content || (
          <div style={{ 
            padding: 'var(--space-4)', 
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--text-base)',
            lineHeight: 'var(--leading-relaxed)'
          }}>
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>Empty</p>
          </div>
        )}
      </div>
    </div>
  )
}
