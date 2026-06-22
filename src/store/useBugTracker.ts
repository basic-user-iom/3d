import { create } from 'zustand'
import { writeBugToFile } from '../utils/bugFileWriter'

export interface BugReport {
  id: string
  timestamp: number
  type: 'error' | 'warning' | 'info' | 'console'
  message: string
  source: string // file/component where error occurred
  stack?: string
  details?: any
  confirmed: boolean
  fixed: boolean
  category?: string // 'HDR', 'Material', 'Lighting', 'Water', etc.
}

interface BugTrackerState {
  bugs: BugReport[]
  enabled: boolean
  maxBugs: number
  
  addBug: (bug: Omit<BugReport, 'id' | 'timestamp' | 'confirmed' | 'fixed'>) => void
  confirmBug: (id: string) => void
  markFixed: (id: string) => void
  clearBugs: () => void
  clearConfirmed: () => void
  setEnabled: (enabled: boolean) => void
  getUnconfirmedBugs: () => BugReport[]
  getBugsByCategory: (category: string) => BugReport[]
}

export const useBugTracker = create<BugTrackerState>((set, get) => ({
  bugs: [],
  enabled: true,
  maxBugs: 100, // Reduced from 500 to prevent memory issues

  addBug: (bug) => {
    if (!get().enabled) return

    const newBug: BugReport = {
      ...bug,
      id: `bug-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      timestamp: Date.now(),
      confirmed: false,
      fixed: false
    }

    set((state) => {
      const bugs = [...state.bugs, newBug]
      // Keep only the most recent bugs
      const sortedBugs = bugs.sort((a, b) => b.timestamp - a.timestamp)
      return {
        bugs: sortedBugs.slice(0, state.maxBugs)
      }
    })

    // CRITICAL: Don't log to console here - it would cause infinite recursion
    // The original console methods already logged the message
    // Only log if bug tracker is disabled (to avoid recursion)
    // if (!get().enabled) {
    //   const logMethod = bug.type === 'error' ? console.error : bug.type === 'warning' ? console.warn : console.log
    //   logMethod(`[BugTracker] ${bug.type.toUpperCase()}:`, bug.message)
    // }
  },

  confirmBug: async (id) => {
    const updatedBugs = get().bugs.map((bug) =>
      bug.id === id ? { ...bug, confirmed: true } : bug
    )
    
    // Write confirmed bug directly to FIXES_APPLIED.md file
    const confirmedBug = updatedBugs.find(b => b.id === id)
    if (confirmedBug) {
      await writeBugToFile(confirmedBug)
    }
    
    set({ bugs: updatedBugs })
  },

  markFixed: (id) => {
    set((state) => ({
      bugs: state.bugs.map((bug) =>
        bug.id === id ? { ...bug, fixed: true } : bug
      )
    }))
  },

  clearBugs: () => {
    set({ bugs: [] })
  },

  clearConfirmed: () => {
    set((state) => ({
      bugs: state.bugs.filter((bug) => !bug.confirmed)
    }))
  },

  setEnabled: (enabled) => {
    set({ enabled })
  },

  getUnconfirmedBugs: () => {
    return get().bugs.filter((bug) => !bug.confirmed && !bug.fixed)
  },

  getBugsByCategory: (category) => {
    return get().bugs.filter((bug) => bug.category === category)
  }
}))

