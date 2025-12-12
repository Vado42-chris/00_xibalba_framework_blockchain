# Safe Migration Plan — Framework → Alpaca

**DATE:** 2025-12-14  
**SOURCE:** `00_framework` (operations repo)  
**TARGET:** `00_xibalba_alpaca` (virgin seed)  
**NOTE:** Code also on Aries PC and Loki PC

---

## 🟢 SAFE TO MIGRATE (Immediate)

### 1. Window System (Complete)

**Files to Copy:**
```
00_framework/src/components/window/Window.tsx
00_framework/src/components/window/Window.css
00_framework/src/core/window/windowManager.ts
00_framework/src/core/window/windowTypes.ts
00_framework/src/core/window/sessionMemory.ts
00_framework/src/core/window/windowDefaults.ts
```

**Destination:**
```
00_xibalba_alpaca/client/src/components/window/
00_xibalba_alpaca/client/src/core/window/
```

**Why Safe:**
- Spatial semantics is interaction pattern (not enforcement)
- Window management is presentation layer
- No policy logic or constraint validation
- Matches guardrails (DO_NOT_TOUCH.md)

---

### 2. Desktop System

**Files to Copy:**
```
00_framework/src/components/desktop/Desktop.tsx
00_framework/src/components/desktop/Desktop.css
```

**Destination:**
```
00_xibalba_alpaca/client/src/components/desktop/
```

**Why Safe:**
- Desktop is container/background
- No enforcement logic
- Pure presentation

---

### 3. Design System

**Files to Copy:**
```
00_framework/src/styles/design-system.css
```

**Destination:**
```
00_xibalba_alpaca/client/src/styles/design-system.css
```

**Why Safe:**
- Color tokens and design variables
- No secrets or enforcement
- Matches UI_BRIEF.md constraints

---

### 4. UI Components (Selected)

**Safe Components:**
- `src/components/launcher/` - Launcher UI
- `src/components/clipboard/ClipboardWindow.tsx` - Clipboard UI (visual only)
- `src/components/feedback/FeedbackWindow.tsx` - Feedback UI (visual only)

**Why Safe:**
- Visual components only
- No enforcement dependencies
- No policy logic

---

## 🟡 CONDITIONAL (Review First)

### Core UI State

**Files to Review:**
```
00_framework/src/core/ui/uiState.ts
00_framework/src/core/ui/zoneRenderer.ts
00_framework/src/core/ui/instrumentMap.ts
```

**Check For:**
- Enforcement logic
- Policy dependencies
- Constraint validation
- Sprint system integration

**Action:** Review each file, migrate only if UI-only

---

### Templates

**Files to Review:**
```
00_framework/src/templates/BaseTemplate.tsx
00_framework/src/templates/domain-templates/
```

**Check For:**
- Policy logic
- Enforcement hooks
- Constraint validation

**Action:** Migrate if template-only (no enforcement)

---

## 🔴 NEVER MIGRATE (Keep Private)

### Enforcement Core

**Never Include:**
- Sprint executor
- Policy engine
- Constraint validators
- AI governance substrate
- Authority boundaries
- Violation handlers

**These stay in 00_framework or private repos.**

---

## Multi-Computer Fragmentation

### Aries PC
**Status:** ⏳ To be documented  
**Contains:** [Unknown - needs inventory]  
**Safe to Include:** [Pending review]

### Loki PC
**Status:** ⏳ To be documented  
**Contains:** [Unknown - needs inventory]  
**Safe to Include:** [Pending review]

**Action Required:**
1. Inventory Aries PC codebase
2. Inventory Loki PC codebase
3. Identify safe components
4. Consolidate into migration plan

---

## Migration Execution Order

### Step 1: Window System (Highest Priority)

**Why First:**
- Core to tablet-first architecture
- Spatial semantics is key pattern
- Needed for Framework 8 identity

**Commands:**
```bash
# Copy window system
cp -r 00_framework/src/components/window client/src/components/
cp -r 00_framework/src/core/window client/src/core/

# Verify no enforcement dependencies
grep -r "sprint\|policy\|constraint\|enforcement" client/src/components/window client/src/core/window
```

---

### Step 2: Desktop System

**Why Second:**
- Container for windows
- Needed for habitat metaphor

**Commands:**
```bash
cp -r 00_framework/src/components/desktop client/src/components/
```

---

### Step 3: Design System

**Why Third:**
- Foundation for all UI
- Root colors must match

**Commands:**
```bash
cp 00_framework/src/styles/design-system.css client/src/styles/
```

---

### Step 4: Build & Test

**Verify:**
```bash
cd client
npm install
npm run build
```

**Must pass cleanly.**

---

## Safety Verification

**Before Each Migration:**

- [ ] No enforcement logic
- [ ] No policy dependencies
- [ ] No secrets/keys
- [ ] No constraint validation
- [ ] Matches guardrails
- [ ] Builds in Alpaca
- [ ] No enforcement core imports

---

## Next Actions

1. ✅ Generate tree structures (in progress)
2. ⏳ Review window system for safety
3. ⏳ Document Aries/Loki fragmentation
4. ⏳ Execute safe migrations
5. ⏳ Test build after each migration

---

**This plan ensures safe migration without exposing enforcement core.**

#hallbergstrong.  
So say we all.
