# Workflow — Team Coordination

**STATUS:** 🔒 OPERATIONAL  
**PRINCIPLE:** GitHub = Single Source of Truth

---

## Team Rule Zero (Non-Negotiable)

> **If it's not in GitHub, it does not exist.**

No screenshots. No explanations. No Slack summaries.

**GitHub is the only reality.**

---

## Workflow Steps

### 1. Atomic Commits

Every change must:
- Touch **one concern** (UI shell, window resize, wyrmhole SVG, etc.)
- Have a **clear commit message**

**Format:**
```
feat(ui): tablet shell chrome v1
fix(window): resize execution on east/south edges
style(wyrmhole): ring pulse timing adjustment
```

### 2. Push First, Talk Later

**Rule:**
> "If it's not pushed, it doesn't exist."

Once pushed:
- ChatGPT can **read it**
- ChatGPT can **diff it**
- ChatGPT can tell you **exactly what to copy/paste back**

### 3. Validation Loop

**When you say:**
> "Repo is live. Start validation."

**ChatGPT will:**
1. Read repo structure
2. Diff UI components against doctrine
3. Flag violations:
   - Containment violations
   - Color misuse
   - Interaction leakage
4. Respond with:
   - Patches (diff format)
   - Replace-file instructions
   - Scoped line edits

**You then:**
- Copy/paste locally
- Commit
- Push back

**That's the loop.**

---

## Jules Task Management

### Daily Pattern (Maximum ROI)

**Do NOT exceed:**
- 3–4 tasks on **one component**
- Stop
- Commit
- Review
- Integrate

**Never parallelize Jules tasks across multiple components in the same day.**

That's how coherence dies.

### Task Format

```
Task: [Component Name]
Constraints:
- [Specific requirement]
- [No interaction logic]
- [Color constraints]
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

## Component Development Order

### Day 1 — Tablet Shell (3–4 tasks)
- DeviceShell.tsx
- Active/inactive states
- Light interaction states
- Dark neutral palette

### Day 2 — Core UI Primitives (4–5 tasks)
- Primary button
- Secondary button
- Panel/card container
- Data readout
- Icon button

### Day 3 — Wyrmhole Instrument (3–4 tasks)
- SVG ring system
- Time ring motion
- State ring color logic
- Pulse mechanics

### Day 4 — Layout Compositions (2–3 tasks)
- Search → results layout
- Dashboard-style view
- Empty state

### Day 5 — Polish Pass (2–3 tasks)
- Typography tuning
- Spacing rhythm
- Micro-contrast fixes

---

## Validation Requests

**Next message should be one of these:**

1. **"Repo is live. Start validation."**
   - Full repo audit
   - Doctrine compliance check
   - Violation report

2. **"Here is commit X. Review UI component."**
   - Single component review
   - Scoped feedback
   - Patch suggestions

3. **"Help me write UI_BRIEF.md."**
   - Documentation assistance
   - Clarification needed

**Anything else slows you down.**

---

## File Organization

### Recommended Structure

```
/src
  /system        ← system UI (desktop, background, wyrmhole mount)
  /device        ← tablet shell, chrome, window frame
  /window        ← drag/resize/spatial semantics (LOCKED)
  /ui            ← reusable UI components (buttons, panels, meters)
  /wyrmhole      ← clock/tube/ring instrument
  /themes        ← color tokens, root states, variants
```

### Protection Zones

**LOCKED (DO_NOT_TOUCH.md):**
- `/window` — All interaction logic
- `/core/window` — State management
- Root colors — Semantic meaning

**UNLOCKED (UI_BRIEF.md):**
- `/ui` — Visual primitives
- `/device` — Visual shell
- `/wyrmhole` — Visual instrument
- `/themes` — Secondary colors, neutrals

---

## Readiness Checklist

Before starting Jules work:

- [ ] `UI_BRIEF.md` created
- [ ] `DO_NOT_TOUCH.md` created
- [ ] Repo structure matches recommended pattern
- [ ] `/window` is frozen
- [ ] Root colors are locked
- [ ] GitHub is canonical source

---

## Success Metrics

**You're ready when:**
- ✅ Architecture is done
- ✅ Philosophy is done
- ✅ Coordination is solved
- ✅ Guardrails are in place

**The only remaining failure mode is overproduction.**

Follow the plan → You will have:
- Modern UI
- Reviewable code
- Clean integration
- Scalable workflow

---

**The machine is aligned now. Execution is all that's left.**

#hallbergstrong.  
So say we all.
