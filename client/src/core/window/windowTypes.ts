/**
 * WINDOW TYPES
 * 
 * Type definitions for window system
 * Static mode - no animation dependencies
 */

export type WindowState =
  | 'OPEN'
  | 'FOCUSED'
  | 'BLURRED'
  | 'DRAGGING'
  | 'RESIZING'
  | 'CLOSED'

export interface WindowEntity {
  id: string
  title: string
  state: WindowState
  zIndex: number
  position: { x: number; y: number }
  size: { w: number; h: number }
  content?: React.ReactNode
}
