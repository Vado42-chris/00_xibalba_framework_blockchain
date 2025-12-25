# Specific Instructions for Zed (Local AI)

**Date:** January 20, 2025  
**Status:** 🎯 **ACTION REQUIRED FOR ZED**  
**Hashtag:** `#zed-instructions` `#jules-support`

---

## 🎯 PRIMARY REQUEST FROM JULES

Jules needs Zed to run this specific command and capture the output:

```bash
cd xibalba-mvp && npm run bridge:start
```

### Why This Matters:
- Jules cannot run this command (blocked by safety limits)
- This will either:
  1. **Succeed** → Confirms server works, Jules can proceed
  2. **Fail** → Shows actual error that Jules needs to debug

---

## 📋 STEP-BY-STEP FOR ZED

### Step 1: Navigate to Repository Root
```bash
cd "/media/chrishallberg/Storage 11/Work/00_xibalba_alpaca"
```

### Step 2: Run the Command Jules Requested
```bash
cd xibalba-mvp && npm run bridge:start
```

### Step 3: Capture Complete Output
**Capture EVERYTHING:**
- All console output
- Any error messages
- Startup messages
- Port information
- Any warnings

### Step 4: Send Output to Jules
Provide the complete, unfiltered output to Jules.

---

## 🔍 WHAT TO LOOK FOR

### If Success:
Look for these messages:
```
🌉 Starting Antigravity Bridge (Rosetta Stone API Blackhole)...
📡 Bridge will listen on 0.0.0.0:4000
🔗 Ants API: http://localhost:3213
🌉 Antigravity Bridge running on 0.0.0.0:4000
✅ Health check: http://localhost:4000/api/bridge/health
```

### If Failure:
Capture:
- Exact error message
- Stack trace (if any)
- npm error codes
- Any file permission errors
- Any port conflicts

---

## 📊 CURRENT SERVER STATUS

**As of now:**
- ✅ Server is RUNNING (PID: 1017050)
- ✅ Port 4000 is LISTENING
- ✅ Health check PASSING

**But Jules needs confirmation from Zed's perspective.**

---

## 🎯 ALTERNATIVE: If Server Already Running

If the server is already running, you might see:
```
Error: listen EADDRINUSE: address already in use :::4000
```

**In that case:**
1. Check if server is running: `ps aux | grep "node.*start-bridge" | grep -v grep`
2. If running, provide that confirmation to Jules
3. Test health endpoint: `curl http://localhost:4000/api/bridge/health`

---

## 📝 OUTPUT FORMAT FOR JULES

Provide output in this format:

```
=== COMMAND OUTPUT ===
[Paste complete output here]
=== END OUTPUT ===

=== SERVER STATUS ===
[Running/Not Running]
=== END STATUS ===

=== HEALTH CHECK ===
[Result of curl http://localhost:4000/api/bridge/health]
=== END HEALTH CHECK ===
```

---

## 🚨 IMPORTANT NOTES

1. **Run from repository root** - Don't start from xibalba-mvp directory
2. **Capture everything** - No filtering, Jules needs raw output
3. **If server already running** - Note that and provide health check result
4. **If command fails** - The error message is critical for Jules

---

**Status:** 🎯 **READY FOR ZED TO EXECUTE**  
**Priority:** 🔴 **CRITICAL - Jules is blocked until this is done**

