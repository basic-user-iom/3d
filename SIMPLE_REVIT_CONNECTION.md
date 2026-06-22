# 🚀 Simple Revit Connection Guide

**For non-technical users - Just follow these steps!**

---

## 📋 What You Need

1. ✅ Revit 2026 installed
2. ✅ Revit add-in installed (already done if you see "Revit to Web" tab)
3. ✅ This project folder open

---

## 🎯 Step-by-Step: Connect Revit to 3D Viewer

### **Step 1: Start Everything (One Click!)**

1. **Double-click this file:** `ONE_CLICK_START.bat`
   - Location: Project root folder (same folder as this file)
   - What it does: Starts the server and web app automatically

2. **Wait for this message:**
   ```
   ✅ Server initialized successfully
   ✅ WebSocket Server listening on ws://localhost:3003
   ✅ HTTP Server running on http://localhost:3002
   ```

3. **Your browser should open automatically** showing the 3D viewer
   - If it doesn't open, go to: `http://localhost:3000`

---

### **Step 2: Connect in Web App**

1. **In the web app (browser):**
   - Look for the **"Revit Live Link"** panel on the right side
   - If you don't see it, look for a button or menu item called "Revit Connection" or "Revit Live Link"

2. **Click the "Connect" button**
   - You should see: ✅ **"Connected"** (green)

---

### **Step 3: Connect in Revit**

1. **Open Revit 2026**

2. **Open your Revit model** (any .rvt file)

3. **Look for the "Revit to Web" tab** in the ribbon
   - If you don't see it, the add-in might not be installed

4. **Click "Direct Link"** button
   - Revit will automatically:
     - ✅ Check if server is running
     - ✅ Start server if needed
     - ✅ Open web app in browser
     - ✅ Establish connection

5. **You'll see a dialog:** "✅ Direct Link established!"

---

### **Step 4: Export Your Model**

**Option A: Automatic (Recommended)**
- Make changes in Revit
- Wait 3 seconds
- Model updates automatically in web app! ✨

**Option B: Manual**
- Click "Direct Link" again
- Click "Sync Now" in the panel

---

## ✅ Success Checklist

When everything works, you'll see:

- ✅ **Server window:** Shows "Server initialized successfully"
- ✅ **Web app:** Shows "Connected" (green)
- ✅ **Revit:** Shows "Direct Link Active" panel
- ✅ **3D Viewer:** Your Revit model appears!

---

## 🆘 Troubleshooting

### Problem: "Server not running"

**Solution:**
1. Double-click `ONE_CLICK_START.bat` again
2. Wait for "Server initialized" message
3. Try connecting again

---

### Problem: "Cannot connect to server"

**Solution:**
1. Check if `ONE_CLICK_START.bat` is still running
2. Look at the server window - are there any error messages?
3. Close everything and start again

---

### Problem: "Model doesn't appear in 3D viewer"

**Solution:**
1. Make sure you clicked "Connect" in the web app
2. Make sure you clicked "Direct Link" in Revit
3. Wait a few seconds - export takes time
4. Check browser console (F12) for error messages
5. Use the "Copy Logs" button in the web app to get error details

---

### Problem: "Revit says 'Modifying is forbidden'"

**Solution:**
1. **Save your Revit file** (Ctrl+S)
2. **Close any active editing operations** (finish editing walls, doors, etc.)
3. Try "Direct Link" again

---

## 📋 Copying Logs for Help

If something doesn't work, you can copy logs to get help:

### **Method 1: Use the Copy Logs Tool**

1. **Open:** `COPY_LOGS.html` in your browser
   - Location: Project root folder
   - Just double-click the file

2. **Follow the instructions** in the tool
   - It will help you copy browser logs, server logs, and Revit errors

3. **Paste the copied logs** when asking for help

### **Method 2: Use the Copy Logs Button**

1. **In the web app:** Click the **"📋 Copy Logs"** button
2. **Paste** the copied text when asking for help

---

## 🎯 Quick Reference

| What to Do | Where to Do It |
|------------|----------------|
| Start server | Double-click `ONE_CLICK_START.bat` |
| Connect web app | Click "Connect" in Revit Live Link panel |
| Connect Revit | Click "Direct Link" in Revit ribbon |
| Copy logs | Use `COPY_LOGS.html` or "Copy Logs" button |
| Stop everything | Close the server window (Ctrl+C) |

---

## 💡 Tips

- **Keep the server window open** - Don't close it while using Revit connection
- **One click is enough** - Use `ONE_CLICK_START.bat` to start everything
- **Auto-connect works** - Revit will start the server automatically if needed
- **Check the status** - Green = good, Red = problem

---

## 📞 Need More Help?

1. **Check logs:** Use `COPY_LOGS.html` tool
2. **Read:** `WHERE_ARE_LOGS.md` for detailed log locations
3. **Check:** `REVIT_CONNECTION_CHECKLIST.md` for detailed troubleshooting

---

**That's it! You're ready to connect Revit to your 3D viewer! 🎉**
