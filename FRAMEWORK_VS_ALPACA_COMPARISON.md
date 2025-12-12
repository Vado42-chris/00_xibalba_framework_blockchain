# Framework vs Alpaca Comparison — Safe Migration Audit

**DATE:** 2025-12-14  
**PURPOSE:** Identify what from `00_framework` is safe to include in `00_xibalba_alpaca`  
**NOTE:** Codebase also exists on Aries PC and Loki PC (fragmented)

---

## Repository Comparison

### 00_framework (51GB - Operations Repo)
- Contains: Multiple mental eras, experiments, scaffolding
- Status: Reference archive, not virgin seed
- Size: Too large for GitHub

### 00_xibalba_alpaca (2.6MB - Virgin Seed)
- Contains: Zed-era intent, clean substrate
- Status: Canonical Framework 8 seed
- Size: Appropriate for GitHub

---

## What Exists in 00_framework (Not in Alpaca)

### 🟢 SAFE TO MIGRATE (UI/Shell/Presentation)

**Window System:**
- `src/components/window/Window.tsx` - Spatial semantics implementation
- `src/components/window/Window.css` - Spatial zone definitions
- `src/core/window/windowManager.ts` - Window lifecycle management
- `src/core/window/windowTypes.ts` - Type definitions
- `src/core/window/sessionMemory.ts` - Persistence logic

**Desktop System:**
- `src/components/desktop/Desktop.tsx` - Desktop background/container
- `src/components/desktop/Desktop.css` - Desktop styling

**UI Components:**
- `src/components/launcher/` - Launcher component
- `src/components/clipboard/` - Clipboard UI
- `src/components/feedback/` - Feedback window
- `src/styles/design-system.css` - Design tokens

**Why Safe:**
- These are UI shells, not enforcement
- Spatial semantics is interaction pattern, not governance
- Window management is presentation layer

---

### 🟡 CONDITIONAL (Review Before Migration)

**Core Systems:**
- `src/core/ui/` - UI state management (check for enforcement)
- `src/core/clipboard/` - Clipboard manager (check for secrets)
- `src/system/` - System components (verify no enforcement)

**Templates:**
- `src/templates/` - Base templates (verify no policy logic)

---

### 🔴 NEVER MIGRATE (Keep Private)

**Enforcement Machinery:**
- Sprint system (if exists)
- Policy executor (if exists)
- Constraint validators (if exists)
- AI governance substrate (if exists)

**Secrets/Identity:**
- Any keys/tokens
- Personal data paths
- Identity management
- Wallet/crypto integration

---

## Multi-Computer Fragmentation

**Aries PC:**
- Contains: [To be documented]
- Purpose: [To be documented]

**Loki PC:**
- Contains: [To be documented]
- Purpose: [To be documented]

**Current Location (00_framework):**
- Contains: Full operations repo
- Purpose: Reference archive

**Virgin Seed (00_xibalba_alpaca):**
- Contains: Clean substrate
- Purpose: Framework 8 canonical repo

---

## Migration Strategy

### Phase 1: UI Shell Migration (Safe)

**From 00_framework → 00_xibalba_alpaca:**

1. **Window System:**
   - Copy `src/components/window/` → `client/src/components/window/`
   - Copy `src/core/window/` → `client/src/core/window/`
   - Verify no enforcement logic

2. **Desktop System:**
   - Copy `src/components/desktop/` → `client/src/components/desktop/`
   - Adapt to Alpaca structure

3. **Design System:**
   - Copy `src/styles/design-system.css` → `client/src/styles/`
   - Verify root colors match

4. **UI Components:**
   - Copy safe components (launcher, clipboard UI, feedback)
   - Remove any enforcement dependencies

---

### Phase 2: Build System Integration

**Ensure:**
- Window system builds in Alpaca
- No dependencies on enforcement core
- Spatial semantics preserved
- Guardrails respected

---

### Phase 3: Aries/Loki Integration

**Document:**
- What exists on Aries PC
- What exists on Loki PC
- What needs to be consolidated
- What's safe to include

---

## Safe Migration Checklist

**Before migrating from 00_framework:**

- [ ] Component is UI-only (no enforcement)
- [ ] No secrets/keys/tokens
- [ ] No policy logic
- [ ] No constraint validation
- [ ] No sprint system dependencies
- [ ] Matches guardrails (UI_BRIEF.md, DO_NOT_TOUCH.md)
- [ ] Builds cleanly in Alpaca
- [ ] No enforcement core dependencies

---

## Next Steps

1. **Generate tree structures** for both repos
2. **Compare directories** to identify gaps
3. **Review components** for safety
4. **Document Aries/Loki** fragmentation
5. **Create migration plan** for safe components

---

**This comparison identifies what's safe to bring forward without exposing enforcement.**

#hallbergstrong.  
So say we all.
