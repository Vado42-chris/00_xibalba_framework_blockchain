# Repository Structure for ChatGPT Review

**REPOSITORY:** `https://github.com/Vado42-chris/00_xibalba_framework_blockchain`  
**PURPOSE:** Provide structural visibility for architectural review

---

## Top-Level Directory Structure

```
00_xibalba_alpaca/
├── client/                    # React/Vite frontend
│   ├── src/
│   │   ├── App.tsx           # Main component (505 lines)
│   │   ├── main.tsx          # Entry point
│   │   ├── App.css
│   │   └── index.css
│   ├── package.json          # Dependencies: React, Vite, TypeScript, Tailwind
│   ├── vite.config.ts        # Vite config with proxy
│   └── tsconfig.json         # TypeScript config
│
├── server/                    # Express/Node.js backend
│   ├── index.js              # API server (338 lines)
│   ├── package.json          # Dependencies: express, ssh2, ws
│   └── nodes.json            # Node configuration storage
│
├── blockchain/                # Memory system
│   └── memory_system/        # Blockchain records
│       └── github_publishing_ip_safety_ξ_20251212.md
│
├── docs/                      # Documentation
├── aries/                     # ARIES system components
├── agents/                    # Agent scripts
├── scripts/                   # Automation scripts
│
├── UI_BRIEF.md               # UI guardrails (Jules constraints)
├── DO_NOT_TOUCH.md           # Protected code boundaries
├── WORKFLOW.md               # Team coordination rules
├── README.md                 # Project overview
└── .gitignore                # Git ignore rules
```

---

## Key Files for Review

### 1. Main Component: `client/src/App.tsx`

**Lines:** 505  
**Purpose:** Prompt Forge UI - Multi-node orchestration interface

**Key Patterns:**
- State-driven UI (useState hooks)
- Real-time updates (WebSocket)
- API integration (Axios)
- Component composition

**Architecture:**
- No page routing
- State rotation instead
- Components react to variables
- Room-like interface

---

### 2. Build Configuration: `client/vite.config.ts`

**Key Settings:**
- React plugin
- Proxy to backend (`/api` → `http://loki:3000`)
- Server host: `loki`
- Port: `5173`

---

### 3. Server: `server/index.js`

**Lines:** 338  
**Purpose:** Express API server for Prompt Forge

**Endpoints:**
- `/api/health` - Health check
- `/api/nodes` - Node management
- `/api/execute` - Workflow execution
- `/api/pull` - File pull from nodes
- `/api/push` - File push to nodes
- `/api/staging` - Staging area

**Features:**
- SSH connection management
- WebSocket server (port 3001)
- File staging system

---

## Architecture Patterns Visible

### Room Rotation Pattern

**Current Implementation:**
- `App.tsx` shows state-driven UI
- Components react to state changes
- No page navigation
- State rotation instead of page swap

**What Needs Formalization:**
- Room rotation as primitive
- Variable contracts
- State space definition
- Invariant preservation

---

### Component Reactivity

**Pattern:**
- Components respond to state variables
- Templates are variable-reactive
- Context rotates, not content
- Same pattern at different scales (fractal)

---

## Guardrails (Framework 8)

### UI_BRIEF.md
- Tablet-First Architecture
- Material Realism
- Root Colors Sacred
- "Looks Amazing" Mandate

### DO_NOT_TOUCH.md
- Protected: `/window`, `/core/window`
- Locked: Root colors, spatial semantics
- Safe: `/ui`, `/device`, `/wyrmhole`

### WORKFLOW.md
- Atomic commits
- 3-agent coordination
- Push-first workflow

---

## What's NOT in This Repo

**Private-Core (Not Published):**
- Sprint system
- Policy executor
- Constraint validators
- AI governance substrate
- Enforcement machinery

**This repo = window (shells/interfaces/UI)**  
**Private-core = house (enforcement/enforcement)**

---

## For ChatGPT Review

**Focus Areas:**
1. Room rotation pattern identification
2. Variable reactivity formalization
3. Component contract definition
4. Fractal repetition detection
5. Sacred variables identification
6. Jules-safe zone marking

**What ChatGPT Can Propose:**
- Exact component contracts
- Room rotation primitives
- Variable mutation rules
- State space definition
- Invariant preservation mechanisms

---

**This structure represents the "window" — safe surface for architectural review.**

#hallbergstrong.  
So say we all.
