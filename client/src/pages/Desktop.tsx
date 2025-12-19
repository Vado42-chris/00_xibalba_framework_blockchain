import React from 'react'
import { Desktop as DesktopSurface } from '../components/desktop/Desktop'

const DesktopPage: React.FC = () => {
  return (
    <div style={{ height: '100%', minHeight: '100vh', background: 'var(--bg-primary, #0b1020)', color: 'var(--text-primary, #e6eef6)' }}>
      {/* The Desktop component implements the windowing surface and manages its own state.
          This page simply mounts it so it can be routed to at /desktop. */}
      <DesktopSurface />
    </div>
  )
}

export default DesktopPage
