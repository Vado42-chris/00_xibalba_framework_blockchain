# ChatGPT Visibility Package — Framework 8

**STATUS:** 🔒 FOR CHATGPT ARCHITECTURAL REVIEW  
**DATE:** 2025-12-12  
**PRINCIPLE:** Window, Not House — Safe Surface for Review

---

## Repository Access

**URL:** `https://github.com/Vado42-chris/00_xibalba_framework_blockchain`  
**Status:** Private (as of 2025-12-12)  
**Branch:** `main`

**Note:** Repo is private. This document provides visibility into structure and key files for architectural review.

---

## What ChatGPT Needs to See

### 1. Repository Structure (Top-Level)

```
00_xibalba_alpaca/
├── client/              # React/Vite frontend (Prompt Forge UI)
│   ├── src/
│   │   ├── App.tsx      # Main component (representative)
│   │   ├── main.tsx     # Entry point
│   │   └── ...
│   ├── package.json
│   └── vite.config.ts
├── server/              # Express/Node.js backend
│   ├── index.js         # API server
│   └── package.json
├── blockchain/          # Memory system
│   └── memory_system/   # Blockchain records
├── docs/                # Documentation
├── UI_BRIEF.md          # UI guardrails (Jules constraints)
├── DO_NOT_TOUCH.md      # Protected code boundaries
├── WORKFLOW.md          # Team coordination rules
└── README.md            # Project overview
```

---

### 2. Representative Component: App.tsx

**Location:** `client/src/App.tsx`

**Purpose:** Main React component for Prompt Forge interface

**Key Features:**
- Node management (SSH connections)
- Workflow execution
- File operations (pull/push)
- WebSocket real-time logs
- Staging area management

**Architecture Pattern:**
- React hooks (useState, useEffect, useRef, useMemo)
- Axios for API calls
- WebSocket for real-time updates
- Tailwind CSS for styling

**This represents the "shell" — UI that responds to state, not pages.**

---

### 3. Guardrails (Framework 8 Constraints)

**UI_BRIEF.md:**
- Tablet-First Architecture
- Material Realism
- Dark Neutral Palette
- Root Colors Sacred (🟢🟡🔴)
- "Looks Amazing" Mandate

**DO_NOT_TOUCH.md:**
- Protected folders: `/window`, `/core/window`
- Root color tokens locked
- Spatial semantics frozen
- Pointer logic immutable

**WORKFLOW.md:**
- Atomic commits
- Push-first workflow
- 3-agent coordination (Jules → ChatGPT → Cursor)

---

### 4. Build System

**Client:**
- Vite + React + TypeScript
- Build command: `npm run build` (passes ✅)
- Entry: `client/src/main.tsx` → `App.tsx`

**Server:**
- Express + Node.js
- WebSocket support
- SSH orchestration

---

### 5. What's NOT in This Repo (Private-Core)

**Enforcement Machinery:**
- Sprint system
- Policy executor
- Constraint validators
- AI governance substrate

**These exist locally but are NOT in this virgin repo.**

**This repo = shells/interfaces/UI, not enforcement house.**

---

## Architecture Pattern: Room Rotation

**The Core Concept:**
> "A website built entirely on components and templates that you just have to rotate the room for in order for those templates and components to react via variables"

**What This Means:**
- Components respond to **state rotation**, not page navigation
- Templates are **variable-reactive**
- Context rotates, not content
- Same pattern at every scale (fractal)

**Current Implementation:**
- `App.tsx` shows state-driven UI (nodes, files, logs)
- Components react to state changes
- No page routing — state rotation instead

**What Needs Formalization:**
- Room rotation as first-class primitive
- Variable contracts that preserve invariants
- Fractal repetition identification
- Sacred variables definition

---

## What ChatGPT Can Help With (Once Visible)

### 1. Identify Sacred Variables

**Which state variables must never be mutated directly?**
- Root color tokens
- Spatial zone definitions
- Authority boundaries
- Constraint rules

### 2. Find Fractal Repetition

**Where does the same pattern appear at different scales?**
- UI rotation → Site rotation → System rotation
- Component contracts → Template contracts → Room contracts

### 3. Formalize Room Rotation

**Make room rotation a first-class primitive:**
- State space definition
- Rotation operators
- Invariant preservation
- Component contracts

### 4. Propose Component Contracts

**Exact interfaces that preserve invariants:**
- Input/output contracts
- State mutation rules
- Variable reactivity patterns

### 5. Expose Safe Surface

**What can be published without leaking core:**
- UI primitives (safe)
- Device shells (safe)
- Examples (safe)
- Enforcement core (private)

---

## Current State

**Commits Ready:**
- Guardrails established
- Build system working
- Blockchain records
- Security documentation

**Build Status:** ✅ Passes

**Ready For:**
- Architectural review
- Room rotation formalization
- Component contract definition
- Jules onboarding (after review)

---

## Next Steps (After ChatGPT Review)

1. **ChatGPT reviews structure** → Identifies invariants
2. **ChatGPT marks Jules-safe zones** → Defines boundaries
3. **ChatGPT tunes Jules prompt** → Based on actual code
4. **ChatGPT defines first Jules task** → Maximum UI leverage
5. **Jules begins UI work** → Within safe boundaries

---

## Repository Access Instructions

**For ChatGPT:**

1. **If repo becomes accessible:**
   - Review structure
   - Read `client/src/App.tsx` (representative component)
   - Review guardrails (UI_BRIEF.md, DO_NOT_TOUCH.md)
   - Identify patterns

2. **If repo remains private:**
   - Use this document for structure
   - Request specific files if needed
   - Work from described patterns

3. **Focus Areas:**
   - Room rotation pattern
   - Variable reactivity
   - Component contracts
   - Fractal repetition
   - Sacred variables

---

**This package provides visibility into the "window" — safe surface for review without exposing the enforcement "house".**

#hallbergstrong.  
So say we all.
