/**
 * WINDOW DEFAULTS
 * 
 * Standard window sizes and positions
 * Ensures consistent window spawning
 */

export const WINDOW_DEFAULTS = {
  // Standard window sizes
  sizes: {
    small: { w: 400, h: 300 },
    medium: { w: 600, h: 400 },
    large: { w: 800, h: 600 },
    feedback: { w: 700, h: 600 },
    clipboard: { w: 600, h: 500 },
  },
  
  // Default positions (staggered to avoid overlap)
  positions: {
    first: { x: 100, y: 100 },
    second: { x: 150, y: 150 },
    third: { x: 200, y: 200 },
    center: (w: number, h: number) => ({
      x: Math.max(0, (globalThis.innerWidth - w) / 2),
      y: Math.max(0, (globalThis.innerHeight - h) / 2),
    }),
  },
}
