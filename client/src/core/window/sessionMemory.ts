/**
 * SESSION MEMORY
 * 
 * Persists window positions and sizes to localStorage
 * Restores "yesterday's desk" on reload
 * 
 * #hallbergway — The desk remembers
 */

import { WindowEntity } from './windowTypes'

const STORAGE_KEY = 'xibalba-windows-layout'
const LAYOUT_KEY = 'default'

export interface SavedLayout {
  windows: Array<{
    id: string
    title: string
    position: { x: number; y: number }
    size: { w: number; h: number }
  }>
  timestamp: number
}

/**
 * Saves current window layout to localStorage
 */
export function saveLayout(windows: WindowEntity[]): void {
  try {
    const layout: SavedLayout = {
      windows: windows.map(w => ({
        id: w.id,
        title: w.title,
        position: w.position,
        size: w.size,
      })),
      timestamp: Date.now(),
    }
    
    const layouts = getSavedLayouts()
    layouts[LAYOUT_KEY] = layout
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
  } catch (err) {
    console.warn('Failed to save layout:', err)
  }
}

/**
 * Loads saved layout from localStorage
 */
export function loadLayout(): SavedLayout | null {
  try {
    const layouts = getSavedLayouts()
    return layouts[LAYOUT_KEY] || null
  } catch (err) {
    console.warn('Failed to load layout:', err)
    return null
  }
}

/**
 * Gets all saved layouts
 */
function getSavedLayouts(): Record<string, SavedLayout> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * Clears saved layout
 */
export function clearLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('Failed to clear layout:', err)
  }
}
