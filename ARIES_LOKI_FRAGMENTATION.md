# Aries & Loki PC Fragmentation — Inventory Needed

**DATE:** 2025-12-14  
**STATUS:** ⏳ **INVENTORY REQUIRED**

---

## Multi-Computer Codebase

**Current Understanding:**
- Codebase is fragmented across 2 computers (Aries PC, Loki PC)
- Need to inventory what exists where
- Need to identify safe components from each

---

## Aries PC

**Status:** ⏳ **Needs Inventory**

**Questions:**
- What code exists on Aries PC?
- What's the directory structure?
- What components are safe to include?
- What's enforcement vs. UI?

**Action Required:**
- Generate tree structure
- Identify safe components
- Document what's missing from Alpaca

---

## Loki PC

**Status:** ⏳ **Needs Inventory**

**Questions:**
- What code exists on Loki PC?
- What's the directory structure?
- What components are safe to include?
- What's enforcement vs. UI?

**Action Required:**
- Generate tree structure
- Identify safe components
- Document what's missing from Alpaca

---

## Consolidation Strategy

**Goal:** Bring safe components from all locations into `00_xibalba_alpaca`

**Process:**
1. Inventory Aries PC
2. Inventory Loki PC
3. Compare with 00_framework
4. Compare with 00_xibalba_alpaca
5. Identify safe gaps
6. Migrate safe components

---

## Safe Components Checklist (All Locations)

**From Any Location, Safe If:**
- [ ] UI component (visual only)
- [ ] No enforcement logic
- [ ] No policy dependencies
- [ ] No secrets/keys
- [ ] No constraint validation
- [ ] Matches guardrails
- [ ] Builds cleanly

---

**This document tracks fragmentation across Aries, Loki, and local repos.**

#hallbergstrong.  
So say we all.
