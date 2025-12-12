# Closure Pass Instructions — Framework 8

**STATUS:** 🔒 LOCKED  
**PHASE:** B — Closure (Cursor-only)  
**PRINCIPLE:** Complete, clarify, or remove — do not expand

---

## Directive for Cursor

**This repository is the canonical Framework 8 substrate.**

**Your job is closure, not expansion.**

**Make the project build and run cleanly.**

**Do not add features.**

**Do not invent abstractions.**

**Do not restructure directories.**

**Only complete, clarify, or remove what is already here so the repo is coherent.**

---

## What Cursor Should Do

✅ **Remove dead code**
- Unused imports
- Commented-out blocks
- Orphaned files

✅ **Fix imports**
- Broken module references
- Missing dependencies
- Path corrections

✅ **Make build pass**
- TypeScript errors
- Linter errors
- Build configuration issues

✅ **Ensure one runnable entry point**
- Clear `npm start` or equivalent
- Working dev server
- Working build output

✅ **Leave comments where intent is implied**
- Document unclear code
- Explain non-obvious decisions
- Mark TODO items clearly

---

## What Cursor Must NOT Do

❌ **Add UI polish**
- No styling improvements
- No component enhancements
- No visual refinements

❌ **Add automation**
- No scripts
- No tooling
- No CI/CD

❌ **Add abstractions "for later"**
- No premature optimization
- No "might need" code
- No speculative architecture

❌ **Anticipate Jules**
- No UI component scaffolding
- No placeholder structures
- No "ready for" comments

---

## Success Criteria

**Phase B ends when:**

```bash
cd client
npm install
npm run build
```

**Passes cleanly with no errors.**

---

## Current State

- ✅ Guardrails committed
- ⏳ Build status: Checking...
- ⏳ Closure pass: Pending

---

**This is closure, not creation.**

#hallbergstrong.  
So say we all.
