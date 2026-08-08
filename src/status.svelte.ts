// `key` names the source, not the occurrence: a repeat replaces, not stacks.
export interface Toast {
  key: string
  message: string
}

// Everything the UI watches while a load runs, plus the timing counters
// logTimings() reports once a load completes.
export class Status {
  public loading: boolean = $state(false)
  public toasts: Toast[] = $state([])

  public progress: number = $derived.by(() => {
    if (this.totalRepos === 0) return 0
    // Clamp: concurrent star changes can push reposProcessed past totalRepos.
    return Math.min(this.reposProcessed / this.totalRepos, 1)
  })

  private totalRepos = $state(0)
  private reposProcessed = $state(0)
  private requestTime = 0
  private processingTime = 0

  // Leaves loading and the toasts alone — each entry point sequences those.
  public clear(): void {
    this.totalRepos = 0
    this.reposProcessed = 0
    this.requestTime = 0
    this.processingTime = 0
  }

  // Replaces whatever that key last had to say.
  public notify(key: string, message: string): void {
    const index = this.toasts.findIndex((toast): boolean => toast.key === key)

    if (index === -1) {
      this.toasts.push({ key, message })
    } else {
      this.toasts[index] = { key, message }
    }
  }

  public dismiss(key: string): void {
    this.toasts = this.toasts.filter((toast): boolean => toast.key !== key)
  }

  // Teardown only — a success elsewhere must not swallow an unrelated error.
  public clearToasts(): void {
    this.toasts = []
  }

  // Every manifest page repeats the count; the first one wins.
  public countRepos(total: number): void {
    this.totalRepos ||= total
  }

  public advance(repos: number): void {
    this.reposProcessed += repos
  }

  public addRequestTime(ms: number): void {
    this.requestTime += ms
  }

  public addProcessingTime(ms: number): void {
    this.processingTime += ms
  }

  public logTimings(): void {
    console.log(`Total Request Time: ${this.requestTime.toFixed(2)} ms`)
    console.log(`Total Processing Time: ${this.processingTime.toFixed(2)} ms`)
  }
}
