import type { BugReport } from '../store/useBugTracker'

export async function writeBugToFile(_bug: BugReport): Promise<string> {
  return ''
}

export async function writeFixToFile(_bug: BugReport, _fix: string): Promise<string> {
  return ''
}

