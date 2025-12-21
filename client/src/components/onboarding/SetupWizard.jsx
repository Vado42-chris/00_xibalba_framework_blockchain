import React, { useState } from "react";

/**
 * Minimal SetupWizard stub (hotfix).
 * - Prevents "SetupWizard is not defined" runtime errors in production
 * - Shows a simple modal with Skip / Complete buttons
 * - Calls `onComplete` / `onSkip` callbacks if provided by the host page
 *
 * Replace with the full implementation (from Cursor backup) when ready.
 */

const SetupWizard = ({ onComplete = () => {}, onSkip = () => {} }) => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const closeAndComplete = () => {
    try {
      onComplete();
    } catch (e) {
      // swallow errors from host callback
    }
    setVisible(false);
  };

  const closeAndSkip = () => {
    try {
      onSkip();
    } catch (e) {
      // swallow errors from host callback
    }
    setVisible(false);
  };

  return (
    <div
      data-testid="setup-wizard-stub"
      aria-modal="true"
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        background: "rgba(0,0,0,0.6)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: 760,
          maxWidth: "100%",
          background: "var(--bg-elevated, #0f0f0f)",
          borderRadius: 12,
          padding: 20,
          color: "var(--text-primary, #fff)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
          border: "1px solid rgba(255,255,255,0.03)",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Setup Wizard (placeholder)</h2>
          <button
            onClick={closeAndSkip}
            aria-label="Close setup wizard"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary, #bfbfbf)",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </header>

        <p style={{ color: "var(--text-secondary, #bfbfbf)", marginTop: 12 }}>
          The full installer is temporarily unavailable. This placeholder prevents a runtime error and lets you continue
          using the site. You can Skip or mark the setup as Complete — the host page will receive the event.
        </p>

        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 18,
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <button
            onClick={closeAndSkip}
            style={{
              background: "transparent",
              color: "var(--text-secondary, #bfbfbf)",
              border: "1px solid var(--border-default, #2a2a2a)",
              padding: "8px 14px",
              borderRadius: 8,
              cursor: "pointer",
              minWidth: 100,
            }}
          >
            Skip
          </button>

          <button
            onClick={closeAndComplete}
            style={{
              background: "var(--accent, #06B6D4)",
              color: "var(--accent-button-text, #000)",
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              minWidth: 100,
            }}
          >
            Complete
          </button>
        </div>

        <small style={{ display: "block", marginTop: 14, color: "var(--text-muted, #666666)" }}>
          Temporary hotfix: full installer will be restored from backup in a follow-up update.
        </small>
      </div>
    </div>
  );
};

export default SetupWizard;
