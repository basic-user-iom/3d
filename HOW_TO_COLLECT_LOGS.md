# How to Collect All Logs - Quick Guide

## 🚀 Super Quick Method

### Step 1: Run PowerShell Script
**Double-click:** `COLLECT_LOGS_NOW.bat`

This automatically collects:
- ✅ Server status
- ✅ Port status  
- ✅ Revit journal errors
- ✅ Process information
- ✅ File checks

**Result:** A text file opens with all the information (`REVIT_LOGS_YYYYMMDD_HHMMSS.txt`)

### Step 2: Open HTML Tool in Browser
1. **Open:** `COLLECT_ALL_LOGS.html` in your browser
   - **Important:** Open it in the **same browser** where your 3D viewer is running!
   - Just double-click the file, or drag it into your browser

2. **Click these buttons in order:**
   - 📥 **"Collect Browser Logs"** - Captures console logs
   - 🌐 **"Collect Server Status"** - Checks server health
   - 👁️ **"Collect Viewer State"** - Checks if models are in scene

3. **Generate Report:**
   - 📊 **"Generate Complete Report"** - Creates full report
   - 📋 **"Copy to Clipboard"** - Copies everything

4. **Share:** Paste the complete report here for analysis

## 📋 What Gets Collected

### From PowerShell Script (`COLLECT_LOGS_NOW.bat`):
- Server health check (port 3002)
- Active sessions
- Port status (3000, 3002, 3003)
- Revit journal errors (latest file)
- Running processes (node, Revit, Code)
- File existence checks

### From HTML Tool (`COLLECT_ALL_LOGS.html`):
- Browser console logs (automatically captured)
- Server status (real-time API calls)
- Viewer state (scene children, Revit models)
- WebSocket connection status
- Complete formatted report

## 🎯 When to Use

**Use this when:**
- Model is not showing in 3D viewer
- Export is failing
- Connection issues
- Any error occurs

**Best time to collect:**
- **Right after** clicking "Direct Link" in Revit
- **While** the error is happening
- **Before** closing any windows

## 💡 Tips

1. **Keep browser open:** The HTML tool needs the 3D viewer page open to capture logs
2. **Run PowerShell first:** Gets server/system info
3. **Then run HTML tool:** Gets browser/viewer info
4. **Combine both reports:** Share both for complete analysis

## 🔍 Quick Troubleshooting

### HTML tool not capturing logs?
- Make sure you opened it in the **same browser** as the 3D viewer
- Click "Collect Browser Logs" **after** interacting with the viewer
- Check browser console (F12) - logs should appear there

### PowerShell script fails?
- Make sure server is running (or it will show "NOT AVAILABLE" which is fine)
- Check if Revit is installed (for journal files)
- Script will still create a report even if some checks fail

## 📤 Sharing Logs

**To share logs for analysis:**

1. **Run both tools:**
   - `COLLECT_LOGS_NOW.bat` → Copy the text file contents
   - `COLLECT_ALL_LOGS.html` → Copy the complete report

2. **Combine them:**
   - Paste PowerShell report first
   - Then paste HTML report
   - Add any additional notes

3. **Share everything** - The more information, the better!

## ✅ What I'll Analyze

When you share the logs, I'll check:
- ✅ Is server running?
- ✅ Are ports listening?
- ✅ Did export succeed?
- ✅ Are there Revit errors?
- ✅ Is model update received?
- ✅ Is IFC loader working?
- ✅ Is model in scene?
- ✅ Is model visible?

Then I'll provide specific fixes based on what I find!
