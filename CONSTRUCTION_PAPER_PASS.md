# Construction Paper Pass - Current State & Next Steps

**Date:** 2025-12-14  
**Status:** ✅ Foundation validated, ready to build usable shell

---

## What is Now True

✅ **Canonical MVP:** `00_xibalba_alpaca` is the shipped shell  
✅ **Foundation validated:** Aries + Loki confirm architecture is sound  
✅ **Phase 1-3 complete:** Window system, desktop, design tokens migrated  
✅ **Build passes:** Not theoretical, it compiles  
✅ **Enforcement separation:** No leaks, no identity bleed  

**Blocker:** GitHub auth (identity plumbing, not capability)

---

## Current Desktop State

### What Works (From Migrated Code)

**Desktop.tsx:**
- ✅ Opens windows (`handleNewWindow` - creates Feedback window)
- ✅ Renders windows (`windows.map` - renders Window components)
- ✅ Handles click-away (`handleDesktopClick` - blurs focused window)
- ✅ Keyboard shortcuts (ESC closes focused window)
- ✅ Cursor clearing (pointer move handler)

**Window.tsx (Migrated):**
- ✅ Window component exists (482 lines)
- ✅ Spatial semantics (`getSpatialZone` - location = command)
- ✅ Drag support (`startDrag`/`endDrag`)
- ✅ Focus handling
- ✅ Close button

**Window Manager:**
- ✅ `openWindow`, `closeWindow`, `focusWindow`
- ✅ `moveWindow`, `resizeWindow`
- ✅ Z-index coordination
- ✅ Persistence hooks (commented for Phase 4)

### What Needs Work

**App.tsx:**
- ⚠️ Still Prompt Forge UI (not desktop host)
- ⚠️ Needs to mount `<Desktop />` component
- ⚠️ Currently acts like a page, not an environment

**Integration:**
- ⚠️ Desktop component not mounted in App.tsx
- ⚠️ Window system exists but not wired to entry point

---

## Next Steps (Construction Paper Pass)

### Goal
> "I can sit down, open this thing, and use it to manage the rest."

**Functional. Polished. Calm.**

---

### Step 1: Make App.tsx the Desktop Host

**Current:** `App.tsx` = Prompt Forge UI (page mindset)  
**Target:** `App.tsx` = Desktop Environment (host mindset)

**Action:**
- Mount `<Desktop />` in `App.tsx`
- Move Prompt Forge UI into a window (if needed)
- Desktop mounts once, windows are children

---

### Step 2: Lock in "Windows XP but Disciplined" Feature Set

**Required interactions (this pass only):**
1. ✅ Open window (exists)
2. ✅ Move window (exists - drag)
3. ✅ Focus window (exists)
4. ✅ Close window (exists)
5. ⏳ Stack windows sanely (needs verification)
6. ✅ Desktop click clears focus (exists)

**Not in this pass:**
- Resizing polish
- Snapping
- Animations beyond basic affordance

---

### Step 3: Folder Stacks = Accordion Windows

**For now:**
- Folders are visual stacks, not filesystem truth
- Accordion-on-hover is enough
- Click expands → reveals children windows
- Collapse returns to stack

**Benefits:**
- Density
- Spatial memory
- Zero backend complexity

---

### Step 4: Icons - One Color, SVG, Intentional

**Rules:**
- No emojis
- No gradients
- No skeuomorphic bullshit
- One color per semantic class
- SVG only
- Must read at 16px and 24px

**Action:**
- Pick minimal icon set
- Normalize stroke weight
- Wire semantic color via CSS variables

---

### Step 5: Deploy Something to xi-io.com

**Minimum viable:**
> "Desktop loads → one window opens → placeholder content"

**Purpose:**
- Prove legitimacy
- Calm investors
- Give you air
- Buy time

**Does not need to be permanent. Needs to exist.**

---

## What Desktop Currently Does

**From code analysis:**

**I can:**
- ✅ Open a window (via launcher button or `handleNewWindow`)
- ✅ Move a window (drag via title bar - spatial semantics)
- ✅ Focus a window (click title bar)
- ✅ Close a window (close button)
- ✅ Clear focus (click desktop)

**I cannot yet:**
- ⚠️ See desktop on app load (App.tsx doesn't mount Desktop)
- ⚠️ Stack windows (needs verification)
- ⚠️ Use folder stacks (not implemented)

---

## One Interaction to Improve Next

**Recommendation:** **Window Focus Behavior**

**Why:**
- Core to usability
- Already exists but needs verification
- Quick win that unlocks everything else

**Action:**
1. Mount Desktop in App.tsx
2. Verify focus works (click window = focuses, click desktop = blurs)
3. Test window stacking (multiple windows, z-index)

**Then:** Folder stack hover/accordion

---

## Identity Cleanup (Phase After Air)

**Not now:**
- Consolidate accounts
- Migrate repos
- Move to @xi-io.com
- Rotate keys

**For now:**
- One machine that can push is enough
- One repo being canonical is enough
- One deployment is enough

**Perfection later. Oxygen now.**

---

## Current Status

**Foundation:** ✅ Validated  
**Migrations:** ✅ Complete  
**Build:** ✅ Passes  
**Desktop Code:** ✅ Exists  
**Integration:** ⏳ Needs App.tsx to mount Desktop  

**Next:** Mount Desktop, verify interactions, improve one thing.

---

**Status:** Ready to build the place you can stand while finishing the system.
