# UI_BRIEF.md — Xibalba Alpha

## Mandate

Build a believable habitat where people can live their online lives without friction, fatigue, or fear.

## Core Principle

**Tablet-First Architecture**: Every window is a contained device, not a browser tab.

## Visual Philosophy

- **Material Realism**: Surfaces have depth, weight, and response. No flat UI.

- **Dark Neutral Palette**: No gradients. No primary colors. Only carefully modulated neutrals.

- **Motion as Information**: Interaction states (hover, active, focus) provide feedback, not decoration.

- **Frictionless Interaction**: Spatial semantics decide action. No hover states on non-interactive elements.

---

## Core Doctrine (Non-Negotiable)

### 1. Tablet-as-Device Principle
- Windows are **physical devices** (tablets), not UI panels
- Each window has:
  - **Device shell** (bevel, chrome, depth)
  - **Screen area** (content container)
  - **Physical presence** (shadows, contact with desk)

### 2. Two Modes (System vs Device)
- **System Mode:** Desktop background, wyrmhole, launcher
- **Device Mode:** Everything inside a window/tablet shell
- Never mix metaphors. Never blur boundaries.

### 3. Root Colors Sacred
- **Root Green:** `#22c55e` — System health, success
- **Root Yellow:** `#eab308` — Warning, attention
- **Root Red:** `#ef4444` — Error, danger
- **No gradients on root colors**
- **No opacity variations on root colors**
- Root colors are **semantic**, not decorative

### 4. Secondary Colors (Fractal)
- Cyan, magenta, blue — for instruments, rings, flow
- These can have gradients, pulses, motion
- But **never** replace root colors for state

### 5. "Looks Amazing" Mandate
Every component must pass:
> **"Would someone use this alone, happily?"**

No "good enough" components.
Beauty is structural necessity, not polish.

---

## Design Constraints

### Visual
- **Dark neutral palette** (blacks, grays, subtle whites)
- **No gradients** on structural elements
- **Purposeful motion only** (no decorative animations)
- **Generous hit areas** (16px minimum radius)

### Interaction
- **No interaction logic in UI components**
- UI components are **visual only**
- All pointer/drag/resize logic lives in `/window` (DO NOT TOUCH)

### Typography
- **Inter** font family (locked)
- Clear hierarchy (weight, size, spacing)
- Readable at all sizes

---

## Component Constraints

### Device Shell (`/device/DeviceShell.tsx`)

- Tablet-like chrome with bevel and inset shadow

- Active/inactive states (dim when unfocused)

- Contained content area

- Must accept `children` to wrap existing window content

### UI Primitives (`/ui/`)

- **Button**: Must support `primary`, `secondary`, `icon` variants

- **Panel/Card**: Container with depth and contained overflow

- **Metric/Data Tile**: Displays read-only information cleanly

- **Icon Button**: 32-44px hit zones for touch/mouse

### Wyrmhole (`/wyrmhole/`)

- SVG ring system for time, state, and focus

- Pulse mechanics for live feedback

- Must not interfere with window interaction

---

## Jules Task Format

When requesting UI work from Jules, use this format:

```
Task: [Component Name]
Constraints:
- [Specific visual requirement]
- [No interaction logic]
- [Color constraints]
- [Size/hit area requirements]
Output: TSX + CSS only
```

**Example:**
```
Task: DeviceShell.tsx
Constraints:
- Tablet-like realism
- No gradients
- Dark neutral palette
- No interaction logic
- Must wrap existing window content
Output: TSX + CSS only
```

---

## Validation Criteria

Before any UI component is merged:

1. ✅ Does it follow tablet-as-device principle?
2. ✅ Are root colors used correctly (no gradients)?
3. ✅ Is interaction logic absent (visual only)?
4. ✅ Does it pass "looks amazing" test?
5. ✅ Are hit areas generous (16px minimum)?

---

## Forbidden Practices

- No browser chrome (URL bar, tabs, etc.)

- No gradients or "hero colors"

- No animations without purpose

- No modifying `/window/` or pointer logic

## Output Format

- TypeScript React components

- CSS Modules or Styled Components

- Atomic, single-responsibility files

#hallbergstrong.

So say we all.
