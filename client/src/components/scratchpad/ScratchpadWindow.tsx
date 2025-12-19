import React, { useEffect, useState } from "react";

type Props = {
  id?: string;
  className?: string;
};

/**
 * ScratchpadWindow
 *
 * Lightweight, self-contained scratchpad used as a placeholder.
 * - Persists content to localStorage (per-id) so it survives reloads.
 * - Exposes a simple UI: title, textarea, clear button, and word/char counts.
 *
 * This is intentionally minimal and safe for production builds.
 */
const STORAGE_KEY_PREFIX = "xibalba:scratchpad:";

function storageKey(id?: string) {
  return STORAGE_KEY_PREFIX + (id ?? "default");
}

const containerStyle: React.CSSProperties = {
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minWidth: 280,
  maxWidth: 900,
  color: "var(--text-primary, #e6eef6)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 180,
  borderRadius: 8,
  padding: 10,
  resize: "vertical",
  border: "1px solid rgba(255,255,255,0.06)",
  background: "transparent",
  color: "var(--text-primary, #e6eef6)",
  fontFamily: "var(--font-family, monospace)",
  fontSize: 14,
  lineHeight: 1.5,
};

const controlsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "space-between",
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "none",
  background: "var(--accent, #06b6d4)",
  color: "#061218",
  cursor: "pointer",
  fontWeight: 600,
};

/**
 * Exported component
 */
const ScratchpadWindow: React.FC<Props> = ({ id, className }) => {
  const key = storageKey(id);
  const [value, setValue] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Hydrate from localStorage once
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored != null) setValue(stored);
    } catch {
      // ignoring storage errors (e.g., in private mode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Auto-save to localStorage (debounced)
  useEffect(() => {
    setIsSaving(true);
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // ignore storage errors
      } finally {
        setIsSaving(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [key, value]);

  const clear = () => {
    setValue("");
    try {
      localStorage.removeItem(key);
    } catch {}
  };

  const wordCount =
    value.trim().length === 0 ? 0 : value.trim().split(/\s+/).length;
  const charCount = value.length;

  return (
    <div className={className} style={containerStyle} data-scratchpad-id={id}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>Scratchpad {id ? `— ${id}` : ""}</h3>
        <div style={{ color: "var(--text-tertiary, #9aa6b2)", fontSize: 13 }}>
          {isSaving ? "Saving…" : "Saved"}
        </div>
      </div>

      <textarea
        aria-label="Scratchpad"
        placeholder="Type notes here… (persisted locally)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={textareaStyle}
      />

      <div style={controlsStyle}>
        <div style={{ color: "var(--text-tertiary, #9aa6b2)", fontSize: 13 }}>
          {wordCount} words · {charCount} chars
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              try {
                navigator.clipboard?.writeText(value);
                // small feedback via title attribute fallback
                // (UI feedback could be improved in a real implementation)
              } catch {
                // ignore
              }
            }}
            title="Copy"
            style={{
              ...buttonStyle,
              background: "transparent",
              color: "var(--text-primary)",
            }}
          >
            Copy
          </button>

          <button
            type="button"
            onClick={clear}
            title="Clear"
            style={{
              ...buttonStyle,
              background: "transparent",
              color: "var(--text-primary)",
            }}
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => {
              // quick manual save (also happens automatically)
              try {
                localStorage.setItem(key, value);
              } catch {}
            }}
            title="Save"
            style={buttonStyle}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScratchpadWindow;
export { ScratchpadWindow };
