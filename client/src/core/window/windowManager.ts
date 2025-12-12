/**
 * WINDOW MANAGER
 * 
 * Core window management logic
 * Static mode - no animation, no time dependencies
 * 
 * #hallbergway — Deterministic state, no magic
 */

import { WindowEntity } from './windowTypes'
import { loadLayout } from './sessionMemory'

let windows = new Map<string, WindowEntity>()
let topZ = 1
let focusedId: string | null = null
const listeners = new Set<() => void>()
let debounceT: ReturnType<typeof setTimeout> | null = null

/**
 * Opens a window or focuses existing one
 */
export function openWindow(win: Omit<WindowEntity, 'zIndex' | 'state'>): void {
  const existing = windows.get(win.id)
  if (existing) {
    focusWindow(win.id)
    return
  }

  windows.set(win.id, {
    ...win,
    state: 'FOCUSED',
    zIndex: ++topZ,
  })

  focusedId = win.id
  notifyListeners()
  notifyDeskChanged()
}

/**
 * Closes a window and refocuses if needed
 */
export function closeWindow(id: string): void {
  windows.delete(id)
  if (focusedId === id) {
    focusedId = null
    refocusLast()
  }
  notifyListeners()
  notifyDeskChanged()
}

/**
 * Focuses a window and blurs all others
 */
export function focusWindow(id: string): void {
  const targetWindow = windows.get(id)
  if (!targetWindow) return
  
  windows.forEach(w => {
    if (w.id === id) {
      w.state = 'FOCUSED'
      w.zIndex = ++topZ
      focusedId = id
    } else {
      if (w.state === 'FOCUSED' || w.state === 'DRAGGING') {
        w.state = 'BLURRED'
      }
    }
  })
  notifyListeners()
  notifyDeskChanged()
}

/**
 * Refocuses the most recently used window
 */
function refocusLast(): void {
  let last: WindowEntity | null = null
  for (const w of windows.values()) {
    if (!last || w.zIndex > last.zIndex) {
      last = w
    }
  }
  if (last) {
    focusWindow(last.id)
  }
}

/**
 * Starts dragging a window
 */
export function startDrag(id: string): void {
  const w = windows.get(id)
  if (!w) return
  focusWindow(id)
  w.state = 'DRAGGING'
  notifyListeners()
}

/**
 * Ends dragging a window
 */
export function endDrag(id: string): void {
  const w = windows.get(id)
  if (!w) return
  w.state = 'FOCUSED'
  notifyListeners()
  notifyDeskChanged()
}

/**
 * Moves a window to new position
 */
export function moveWindow(id: string, x: number, y: number): void {
  const w = windows.get(id)
  if (!w) return
  w.position = { x, y }
  notifyListeners()
  notifyDeskChanged()
}

/**
 * Resizes a window
 */
export function resizeWindow(id: string, w: number, h: number): void {
  const window = windows.get(id)
  if (!window) return
  window.size = { w, h }
  notifyListeners()
}

/**
 * Restores windows from saved layout
 */
export function restoreWindows(restoreFn: (win: Omit<WindowEntity, 'zIndex' | 'state'>) => void): void {
  const saved = loadLayout()
  if (!saved || !saved.windows) return
  
  saved.windows.forEach((savedWin: any) => {
    restoreFn({
      id: savedWin.id,
      title: savedWin.title,
      position: savedWin.position,
      size: savedWin.size,
    })
  })
}

/**
 * Gets all windows sorted by z-index
 */
export function getWindows(): WindowEntity[] {
  return Array.from(windows.values()).sort((a, b) => a.zIndex - b.zIndex)
}

/**
 * Gets the currently focused window ID
 */
export function getFocusedWindowId(): string | null {
  return focusedId
}

/**
 * Gets a window by ID
 */
export function getWindow(id: string): WindowEntity | undefined {
  return windows.get(id)
}

/**
 * Updates a window's properties
 */
export function updateWindow(id: string, updates: Partial<WindowEntity>): void {
  const w = windows.get(id)
  if (!w) return
  Object.assign(w, updates)
  notifyListeners()
  notifyDeskChanged()
}

/**
 * Closes the currently focused window
 */
export function closeFocusedWindow(): void {
  if (focusedId) {
    closeWindow(focusedId)
  }
}

// Listener system for React components (listeners already declared at top)
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notifyListeners(): void {
  listeners.forEach(listener => listener())
}

/**
 * Notifies that desk state changed (debounced)
 */
export function notifyDeskChanged(): void {
  if (debounceT) clearTimeout(debounceT)
  debounceT = setTimeout(() => {
    deskChangeListeners.forEach(fn => fn())
  }, 250)
}

/**
 * Subscribe to desk changes
 */
export function onDeskChanged(fn: () => void): () => void {
  deskChangeListeners.add(fn)
  return () => deskChangeListeners.delete(fn)
}

/**
 * Serialize current desk state
 */
export function serializeDesk(): { version: 1; windows: WindowEntity[]; focusedId: string | null } {
  return {
    version: 1,
    windows: Array.from(windows.values()).sort((a, b) => a.zIndex - b.zIndex),
    focusedId,
  }
}

/**
 * Hydrate desk from persisted state
 */
export function hydrateDesk(desk: { windows: WindowEntity[]; focusedId: string | null }): void {
  windows.clear()
  topZ = 1
  
  desk.windows.forEach(w => {
    windows.set(w.id, w)
    topZ = Math.max(topZ, w.zIndex)
  })
  
  focusedId = desk.focusedId ?? null
  notifyListeners()
}

/**
 * Get currently focused window ID
 */
export function getFocusedId(): string | null {
  return focusedId
}

// Desk change listeners (separate from window listeners)
const deskChangeListeners = new Set<() => void>()
