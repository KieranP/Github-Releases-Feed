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
