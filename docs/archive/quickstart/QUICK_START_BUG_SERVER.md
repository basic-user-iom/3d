# 🐛 Quick Start - Bug Auto-Writing

## To Enable Auto-Writing Bugs to FIXES_APPLIED.md:

### Option 1: Use the Batch File (Easiest)
**Double-click `start-dev.bat`** - it starts both servers automatically!

### Option 2: Use npm command
Run this in your terminal:
```bash
npm run dev:full
```

### Option 3: Manual Start (Two Terminals)

**Terminal 1:**
```bash
npm run server
```
You should see: `[BugFix Server] Running on http://localhost:3001`

**Terminal 2:**
```bash
npm run dev
```

## ✅ How to Know It's Working:

1. **Check Terminal 1** - Should show: `[BugFix Server] Running on http://localhost:3001`
2. **Confirm a bug** in the Bug Tracker panel
3. **Check FIXES_APPLIED.md** - The bug should appear automatically!

## ❌ If It's Not Working:

1. Check browser console (F12) - look for:
   - `[BugFix] Bug written to FIXES_APPLIED.md successfully` ✅
   - `[BugFix] Server not available` ❌ (server not running)

2. Make sure port 3001 is not blocked
3. Restart both servers

## 📝 What Happens:

- **Confirm Bug** → Auto-writes to FIXES_APPLIED.md
- **Fix All Bugs** → Auto-writes fixes to FIXES_APPLIED.md
- **No copy/paste needed!** Bugs appear in your editor immediately





