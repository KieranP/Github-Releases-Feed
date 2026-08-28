import type { ReleaseGroup } from './models/release_group.svelte'

const ARROW_STEPS = new Map<string, 1 | -1>([
  ['ArrowDown', 1],
  ['ArrowUp', -1],
])

function hasModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
}

function isFormControl(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return true
  if (target instanceof HTMLTextAreaElement) return true
  return target instanceof HTMLElement && target.isContentEditable
}

function isOnScreen(element: HTMLElement): boolean {
  const { bottom, top } = element.getBoundingClientRect()
  return bottom > 0 && top < globalThis.innerHeight
}

function stepWithin(
  keys: string[],
  index: number,
  step: 1 | -1,
): string | null {
  return keys[Math.min(Math.max(index + step, 0), keys.length - 1)] ?? null
}

// The arrow-key cursor over the feed. Keyed by group rather than index, so a
// merge landing above the cursor doesn't shift it.
export class Navigation {
  // Set by bind:this in releases.svelte.
  public listElement: HTMLElement | undefined = $state()

  private selectedKey: string | null = $state(null)

  private readonly groups: () => ReleaseGroup[]

  public constructor(groups: () => ReleaseGroup[]) {
    this.groups = groups
  }

  public isSelected(group: ReleaseGroup): boolean {
    return group.key === this.selectedKey
  }

  public handleKey(event: KeyboardEvent): void {
    const step = ARROW_STEPS.get(event.key)
    if (step === undefined) return
    if (hasModifier(event) || isFormControl(event.target)) return

    // Otherwise the page scrolls as well as the cursor moving.
    event.preventDefault()
    this.select(step)
  }

  public select(step: 1 | -1): void {
    const keys = this.navigableKeys()
    if (keys.length === 0) return

    const current = this.cursorIndex(keys)

    this.selectedKey =
      current === -1
        ? this.entryKey(keys, step)
        : stepWithin(keys, current, step)

    // Not an attachment: those re-run on every re-derive and re-scroll.
    this.groupElement(this.selectedKey)?.scrollIntoView({ block: 'start' })
  }

  // Groups with no releases aren't rendered, so they can't be selected. The
  // trailing caught-up divider is the only one.
  private navigableKeys(): string[] {
    return this.groups()
      .filter((group): boolean => group.releases.length > 0)
      .map((group): string => group.key)
  }

  // A cursor scrolled out of view counts as none, so the press re-enters beside
  // the reader. Only an element proves that: with no list, the key stands.
  private cursorIndex(keys: string[]): number {
    if (this.selectedKey === null) return -1

    const element = this.groupElement(this.selectedKey)
    if (element !== undefined && !isOnScreen(element)) return -1

    return keys.indexOf(this.selectedKey)
  }

  // Entering lands on what's on screen, not the top of the feed.
  private entryKey(keys: string[], step: 1 | -1): string | null {
    const onScreen = this.firstKeyOnScreen()
    if (onScreen !== null && keys.includes(onScreen)) return onScreen

    return (step === 1 ? keys.at(0) : keys.at(-1)) ?? null
  }

  private firstKeyOnScreen(): string | null {
    const onScreen = this.groupElements().find((element): boolean =>
      isOnScreen(element),
    )

    return onScreen?.dataset['groupKey'] ?? null
  }

  private groupElement(key: string | null): HTMLElement | undefined {
    if (key === null) return undefined

    return this.groupElements().find(
      (element): boolean => element.dataset['groupKey'] === key,
    )
  }

  private groupElements(): HTMLElement[] {
    return [
      ...(this.listElement?.querySelectorAll<HTMLElement>('[data-group-key]') ??
        []),
    ]
  }
}
