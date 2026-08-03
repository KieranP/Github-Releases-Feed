// Everything the UI watches while a load runs, plus the timing counters
// logTimings() reports once a load completes.
export class Status {
  public loading: boolean = $state(false)
  public toast: string = $state('')

  public progress: number = $derived.by(() => {
    if (this.totalRepos === 0) return 0
    // Clamp: concurrent star changes can push reposProcessed past totalRepos.
    return Math.min(this.reposProcessed / this.totalRepos, 1)
  })

  private totalRepos = $state(0)
  private reposProcessed = $state(0)
  private requestTime = 0
  private processingTime = 0

  // Leaves loading and toast alone — each entry point sequences those itself.
  public clear(): void {
    this.totalRepos = 0
    this.reposProcessed = 0
    this.requestTime = 0
    this.processingTime = 0
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
