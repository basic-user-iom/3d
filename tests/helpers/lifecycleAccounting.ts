import { vi } from 'vitest'

/**
 * BUILD-5: Shared fake RAF + listener accounting for lifecycle tests.
 * Lets tests assert bounded scheduling and cleanup across mount/unmount cycles
 * without requiring a full Playwright browser session.
 */

export type FakeRafHandle = {
  schedule: ReturnType<typeof vi.fn<(callback: FrameRequestCallback) => number>>
  cancel: ReturnType<typeof vi.fn<(handle: number) => void>>
  pending: Map<number, FrameRequestCallback>
  flush: (time?: number) => void
  pendingCount: () => number
  reset: () => void
}

export function createFakeRaf(): FakeRafHandle {
  let nextId = 1
  const pending = new Map<number, FrameRequestCallback>()

  const schedule = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++
    pending.set(id, callback)
    return id
  })

  const cancel = vi.fn((handle: number) => {
    pending.delete(handle)
  })

  return {
    schedule,
    cancel,
    pending,
    flush(time = 0) {
      const entries = [...pending.entries()]
      pending.clear()
      for (const [, callback] of entries) {
        callback(time)
      }
    },
    pendingCount() {
      return pending.size
    },
    reset() {
      pending.clear()
      nextId = 1
      schedule.mockClear()
      cancel.mockClear()
    }
  }
}

export type ListenerAccounting = {
  addEventListener: ReturnType<
    typeof vi.fn<(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => void>
  >
  removeEventListener: ReturnType<
    typeof vi.fn<(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions) => void>
  >
  activeCount: () => number
  activeTypes: () => string[]
  reset: () => void
}

/**
 * Track add/removeEventListener pairs by (type + listener identity).
 * Useful for proving dispose() leaves no dangling registrations.
 */
export function createListenerAccounting(): ListenerAccounting {
  const active = new Map<string, Set<EventListenerOrEventListenerObject>>()

  const keyFor = (type: string) => type

  const addEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject, _options?: boolean | AddEventListenerOptions) => {
      const key = keyFor(type)
      let set = active.get(key)
      if (!set) {
        set = new Set()
        active.set(key, set)
      }
      set.add(listener)
    }
  )

  const removeEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject, _options?: boolean | EventListenerOptions) => {
      const set = active.get(keyFor(type))
      if (!set) return
      set.delete(listener)
      if (set.size === 0) active.delete(keyFor(type))
    }
  )

  return {
    addEventListener,
    removeEventListener,
    activeCount() {
      let total = 0
      for (const set of active.values()) total += set.size
      return total
    },
    activeTypes() {
      return [...active.keys()].sort()
    },
    reset() {
      active.clear()
      addEventListener.mockClear()
      removeEventListener.mockClear()
    }
  }
}

export type DisposalLedger = {
  record: (label: string) => void
  counts: () => Record<string, number>
  total: () => number
  reset: () => void
}

/** Count dispose/cleanup calls by label for resource-ownership assertions. */
export function createDisposalLedger(): DisposalLedger {
  const counts = new Map<string, number>()

  return {
    record(label: string) {
      counts.set(label, (counts.get(label) ?? 0) + 1)
    },
    counts() {
      return Object.fromEntries(counts.entries())
    },
    total() {
      let sum = 0
      for (const n of counts.values()) sum += n
      return sum
    },
    reset() {
      counts.clear()
    }
  }
}
