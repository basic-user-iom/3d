/**
 * Simple Express server to handle writing bugs to FIXES_APPLIED.md
 * This runs alongside Vite dev server
 */

import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 3001

app.use(express.json())

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

// Write bug/fix to FIXES_APPLIED.md
app.post('/api/write-bug', (req, res) => {
  try {
    const { markdown } = req.body
    if (!markdown) {
      return res.status(400).json({ error: 'No markdown provided' })
    }

    const filePath = path.join(__dirname, 'FIXES_APPLIED.md')
    
    // Read existing content
    let existingContent = ''
    if (fs.existsSync(filePath)) {
      existingContent = fs.readFileSync(filePath, 'utf-8')
    } else {
      // Create file with header if it doesn't exist
      existingContent = '# Bug Fixes Applied\n\n'
    }

    // Append new bug/fix
    const newContent = existingContent + markdown
    
    // Write back to file
    fs.writeFileSync(filePath, newContent, 'utf-8')
    
    console.log(`[BugFix Server] Written bug/fix to FIXES_APPLIED.md`)
    res.json({ success: true, message: 'Bug written to file' })
  } catch (error) {
    console.error('[BugFix Server] Error writing bug:', error)
    res.status(500).json({ error: error.message })
  }
})

app.listen(PORT, () => {
  console.log(`[BugFix Server] Running on http://localhost:${PORT}`)
  console.log(`[BugFix Server] Ready to write bugs to FIXES_APPLIED.md`)
})





