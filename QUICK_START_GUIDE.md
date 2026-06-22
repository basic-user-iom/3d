# 🚀 Quick Start Guide - Revit Live Link

**The simplest way to connect Revit to your 3D viewer!**

---

## ⚡ Super Quick Start (3 Steps)

### 1️⃣ **Start Everything**
   - **Double-click:** `ONE_CLICK_START.bat`
   - **Wait for:** Browser to open automatically

### 2️⃣ **Connect in Web App**
   - **Click:** "Connect" button in Revit Live Link panel
   - **See:** ✅ "Connected" (green)

### 3️⃣ **Connect in Revit**
   - **Open Revit** → Open your model
   - **Click:** "Direct Link" button in "Revit to Web" tab
   - **Done!** ✨

---

## 📖 Detailed Steps

### Step 1: Start the Server and Web App

**What to do:**
1. Find `ONE_CLICK_START.bat` in your project folder
2. Double-click it
3. A command window will open
4. Your browser should open automatically showing the 3D viewer

**What you'll see:**
```
✅ Server initialized successfully
✅ WebSocket Server listening on ws://localhost:3003
✅ HTTP Server running on http://localhost:3002
```

**Keep this window open!** Don't close it while using Revit connection.

---

### Step 2: Connect in the Web App

**What to do:**
1. In your browser (should be open at `http://localhost:3000`)
2. Look for the **"Revit Live Link"** panel on the right side
3. Click the **"Connect"** button
4. Status should change to: ✅ **"Connected"** (green)

**If you don't see the panel:**
- Look for a menu button or toolbar item
- It might be collapsed - look for a small icon on the right side

---

### Step 3: Connect in Revit

**What to do:**
1. **Open Revit 2026**
2. **Open your Revit model** (any .rvt file)
3. **Look for "Revit to Web" tab** in the ribbon (top menu)
4. **Click "Direct Link"** button

**What happens automatically:**
- ✅ Revit checks if server is running
- ✅ If not running, Revit starts it automatically
- ✅ Browser opens automatically (if not already open)
- ✅ Connection is established

**You'll see:**
```
✅ Direct Link established!

Server: http://localhost:3002
Auto-sync: Enabled

Changes will now sync automatically to your web application.
```

---

### Step 4: Your Model Appears!

**Automatic sync (default):**
- Make changes in Revit
- Wait 3 seconds
- Model updates automatically in web app! ✨

**Manual sync:**
- Click "Direct Link" again in Revit
- Click "Sync Now" in the Direct Link panel

---

## ✅ Success Indicators

When everything works correctly:

| Location | What You'll See |
|----------|----------------|
| **Server Window** | `✅ Server initialized successfully` |
| **Web App** | `✅ Connected` (green status) |
| **Revit** | `✅ Direct Link Active` panel |
| **3D Viewer** | Your Revit model appears! |

---

## 🆘 Common Problems & Solutions

### ❌ Problem: "Server not running"

**Solution:**
1. Double-click `ONE_CLICK_START.bat` again
2. Wait for "Server initialized" message
3. Try connecting again

---

### ❌ Problem: "Cannot connect to server"

**Solution:**
1. Check if `ONE_CLICK_START.bat` window is still open
2. Look at the server window - are there error messages?
3. Close everything (Ctrl+C in server window)
4. Start again with `ONE_CLICK_START.bat`

---

### ❌ Problem: "Model doesn't appear"

**Solution:**
1. ✅ Make sure you clicked "Connect" in web app
2. ✅ Make sure you clicked "Direct Link" in Revit
3. ✅ Wait 10-15 seconds - export takes time
4. ✅ Check browser console (F12) for errors
5. ✅ Use "Copy Logs" button to get error details

---

### ❌ Problem: "Modifying is forbidden"

**Solution:**
1. **Save your Revit file** (Ctrl+S)
2. **Finish any active editing** (walls, doors, etc.)
3. Try "Direct Link" again

---

### ❌ Problem: "Revit to Web tab not showing"

**Solution:**
1. The add-in might not be installed
2. Check: `C:\Users\[YourName]\AppData\Roaming\Autodesk\Revit\Addins\2026\`
3. Look for: `RevitToWebExporter.addin` file
4. If missing, see installation guide

---

## 📋 Getting Help - Copy Logs

If something doesn't work, copy logs to get help:

### **Easy Method: Use Copy Logs Tool**

1. **Open:** `COPY_LOGS.html` in your browser
   - Just double-click the file in your project folder

2. **Follow instructions** in the tool
   - It helps you copy browser logs, server logs, and Revit errors

3. **Paste** the copied logs when asking for help

### **Alternative: Use Copy Logs Button**

1. In the web app, click **"📋 Copy Logs"** button
2. Paste the copied text when asking for help

---

## 🎯 Quick Reference Card

| Task | Action |
|------|--------|
| **Start everything** | Double-click `ONE_CLICK_START.bat` |
| **Connect web app** | Click "Connect" in Revit Live Link panel |
| **Connect Revit** | Click "Direct Link" in Revit ribbon |
| **Copy logs** | Use `COPY_LOGS.html` or "Copy Logs" button |
| **Stop everything** | Close server window (Ctrl+C) |

---

## 💡 Pro Tips

- ✅ **One file starts everything:** Use `ONE_CLICK_START.bat`
- ✅ **Auto-connect works:** Revit starts server automatically if needed
- ✅ **Keep server window open:** Don't close it while using connection
- ✅ **Green = Good:** Green status means everything is working
- ✅ **Red = Problem:** Red status means something needs fixing

---

## 📚 More Help

- **Simple Guide:** `SIMPLE_REVIT_CONNECTION.md`
- **Log Locations:** `WHERE_ARE_LOGS.md`
- **Detailed Troubleshooting:** `REVIT_CONNECTION_CHECKLIST.md`

---

**That's it! You're ready to connect Revit to your 3D viewer! 🎉**

**Remember:** Just double-click `ONE_CLICK_START.bat` and click "Direct Link" in Revit!
