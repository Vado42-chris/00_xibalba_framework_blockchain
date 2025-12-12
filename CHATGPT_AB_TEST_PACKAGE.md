# ChatGPT AB Test Package — Framework vs Alpaca

**DATE:** 2025-12-14  
**PURPOSE:** Enable ChatGPT to compare `00_framework` vs `00_xibalba_alpaca` and identify safe components  
**NOTE:** Codebase also fragmented on Aries PC and Loki PC

---

## Repository Comparison Request

**You asked:**
> "Allow access to the original 00_framework repo as well so ChatGPT can AB test the old vs the new — what does the old codebase have that was not included in the alpaca one that is safe to have on GitHub?"

**This document provides the comparison data.**

---

## Tree Structures

### 00_framework Structure

**Location:** `/media/chrishallberg/Storage 1/Work/00_framework`

**Key Directories:**
```
src/
  components/
    window/          # Window system (spatial semantics) ✅ SAFE
    desktop/         # Desktop container ✅ SAFE
    launcher/        # Launcher UI ✅ SAFE
    clipboard/       # Clipboard UI ✅ SAFE
    feedback/        # Feedback window ✅ SAFE
    workspace/       # Workspace components (review)
    search/          # Search components (review)
  core/
    window/          # Window manager ✅ SAFE
      windowManager.ts
      windowTypes.ts
      sessionMemory.ts
      windowDefaults.ts
    clipboard/       # Clipboard manager (review)
    ui/              # UI state (review for enforcement)
  styles/
    design-system.css  # Design tokens ✅ SAFE
  system/
    SystemIgnition.tsx
  templates/
    BaseTemplate.tsx
    domain-templates/
```

**File Counts:**
- Components: 32 files
- Core: 21 files
- Styles: 1 file

---

### 00_xibalba_alpaca Structure

**Location:** `/media/chrishallberg/Storage 1/Work/00_xibalba_alpaca`

**Key Directories:**
```
client/
  src/
    App.tsx          # Prompt Forge UI (505 lines)
    main.tsx
server/
  index.js           # Express API (338 lines)
blockchain/
  memory_system/     # Blockchain records
docs/                # Documentation
UI_BRIEF.md          # Guardrails
DO_NOT_TOUCH.md      # Protected code
WORKFLOW.md          # Team coordination
```

**What's Missing (From 00_framework):**
- ❌ Window system (spatial semantics)
- ❌ Desktop container
- ❌ Design system tokens
- ❌ Launcher UI
- ❌ Clipboard UI (visual)
- ❌ Feedback UI (visual)

---

## Safety Audit Results

### ✅ SAFE TO MIGRATE (No Enforcement Found)

**Window System:**
- `src/components/window/Window.tsx` - Spatial semantics (482 lines)
- `src/components/window/Window.css` - Zone definitions
- `src/core/window/windowManager.ts` - Window lifecycle (257 lines)
- `src/core/window/windowTypes.ts` - Type definitions
- `src/core/window/sessionMemory.ts` - Persistence
- `src/core/window/windowDefaults.ts` - Defaults

**Verification:** ✅ No enforcement logic found (0 matches for "sprint|policy|constraint|enforcement|governance")

**Desktop System:**
- `src/components/desktop/Desktop.tsx` - Desktop container (157 lines)
- `src/components/desktop/Desktop.css` - Desktop styling

**Design System:**
- `src/styles/design-system.css` - Design tokens (150+ lines)
  - Root colors (🟢🟡🔴)
  - Typography scale
  - Spacing tokens
  - Shadow tokens
  - Border radius
  - Transitions

**UI Components:**
- `src/components/launcher/` - Launcher UI
- `src/components/clipboard/ClipboardWindow.tsx` - Clipboard UI (visual only)
- `src/components/feedback/FeedbackWindow.tsx` - Feedback UI (visual only)

---

### 🟡 CONDITIONAL (Review Before Migration)

**Core UI:**
- `src/core/ui/uiState.ts` - Check for enforcement
- `src/core/ui/zoneRenderer.ts` - Check for policy logic
- `src/core/ui/instrumentMap.ts` - Check for constraints

**Templates:**
- `src/templates/BaseTemplate.tsx` - Check for enforcement hooks
- `src/templates/domain-templates/` - Review each

**Clipboard Manager:**
- `src/core/clipboard/clipboardManager.ts` - Check for secrets/keys

---

### 🔴 NEVER MIGRATE (Keep Private)

**Enforcement Core:**
- Sprint system (if exists)
- Policy executor (if exists)
- Constraint validators (if exists)
- AI governance substrate (if exists)

**These are NOT in window/desktop/system files — they exist elsewhere in 00_framework or private repos.**

---

## Multi-Computer Fragmentation

### Aries PC
**Status:** ⏳ **Inventory Needed**

**Action Required:**
- Generate tree structure
- Identify safe components
- Document what exists there

### Loki PC
**Status:** ⏳ **Inventory Needed**

**Action Required:**
- Generate tree structure
- Identify safe components
- Document what exists there

**Note:** Codebase is fragmented across these machines. Need to consolidate safe components.

---

## What ChatGPT Can Do With This

### 1. Compare Structures

**Identify:**
- What exists in Framework but not Alpaca
- What's safe to migrate
- What should stay private

### 2. AB Test Analysis

**Compare:**
- Window system implementation (Framework has it, Alpaca doesn't)
- Design system (Framework has tokens, Alpaca doesn't)
- Desktop container (Framework has it, Alpaca doesn't)

### 3. Safe Migration Recommendations

**Propose:**
- Exact files to copy
- Integration steps
- Build verification
- Guardrail compliance

### 4. Identify Gaps

**Find:**
- Missing UI components
- Missing design tokens
- Missing interaction patterns
- Safe components from Aries/Loki (once inventoried)

---

## Representative Files for Review

### Window System (Framework)

**File:** `00_framework/src/components/window/Window.tsx`
- **Lines:** 482
- **Pattern:** Spatial semantics (location = command)
- **Key Function:** `getSpatialZone()` - Pure function mapping coordinates to zones
- **Status:** ✅ Safe (no enforcement)

**File:** `00_framework/src/core/window/windowManager.ts`
- **Lines:** 257
- **Pattern:** Window lifecycle management
- **Key Functions:** `openWindow()`, `closeWindow()`, `focusWindow()`, `startDrag()`
- **Status:** ✅ Safe (no enforcement)

### Design System (Framework)

**File:** `00_framework/src/styles/design-system.css`
- **Lines:** 150+
- **Pattern:** Centralized design tokens
- **Key Tokens:** Root colors, typography, spacing, shadows
- **Status:** ✅ Safe (design only)

---

## Migration Priority

### Priority 1: Window System (Critical)

**Why:**
- Core to tablet-first architecture
- Spatial semantics is key pattern
- Needed for Framework 8 identity
- ✅ Verified safe (no enforcement)

**Files:**
- Window.tsx + Window.css
- windowManager.ts + windowTypes.ts + sessionMemory.ts + windowDefaults.ts

### Priority 2: Design System (Foundation)

**Why:**
- Foundation for all UI
- Root colors must match
- Typography/spacing tokens needed

**Files:**
- design-system.css

### Priority 3: Desktop Container (Structure)

**Why:**
- Container for windows
- Needed for habitat metaphor

**Files:**
- Desktop.tsx + Desktop.css

### Priority 4: UI Components (Polish)

**Why:**
- Launcher, clipboard UI, feedback UI
- Enhance usability
- Visual components only

**Files:**
- Launcher, ClipboardWindow, FeedbackWindow

---

## Next Steps for ChatGPT

**Once you have this package:**

1. **Review tree structures** (FRAMEWORK_TREE.txt, ALPACA_TREE.txt)
2. **Compare components** (what's in Framework, missing in Alpaca)
3. **Verify safety** (no enforcement in window system - ✅ confirmed)
4. **Propose migration** (exact files, integration steps)
5. **Account for Aries/Loki** (once inventoried)

---

## Aries/Loki Inventory Needed

**To Complete Comparison:**

1. **Aries PC:**
   - Generate tree structure
   - Identify safe components
   - Document what's unique

2. **Loki PC:**
   - Generate tree structure
   - Identify safe components
   - Document what's unique

3. **Consolidation:**
   - Compare all three locations
   - Identify safe components from each
   - Create unified migration plan

---

**This package enables ChatGPT to perform AB testing comparison and identify safe components to migrate.**

#hallbergstrong.  
So say we all.
