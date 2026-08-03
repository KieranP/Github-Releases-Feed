// jsdom has no IndexedDB, so db.ts's top-level open would fail and log on every
// run. Must be imported before anything that reaches db.ts.
import 'fake-indexeddb/auto'

import { vi } from 'vitest'

class IntersectionObserverStub {
  public readonly root: Element | null = null
  public readonly rootMargin: string = ''
  public readonly thresholds: readonly number[] = []

  public observe = vi.fn()
  public unobserve = vi.fn()
  public disconnect = vi.fn()
  public takeRecords = vi.fn().mockReturnValue([])
}

vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

// Neither is available under jsdom here, and state.svelte reads both at module
// load — so importing anything that touches settings needs them stubbed first.
const storage = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (key: string): string | null => storage.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    storage.set(key, value)
  },
  removeItem: (key: string): void => {
    storage.delete(key)
  },
  clear: (): void => {
    storage.clear()
  },
})

vi.stubGlobal('matchMedia', (): { matches: boolean } => ({ matches: false }))
