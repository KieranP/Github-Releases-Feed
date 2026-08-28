import { describe, expect, it } from 'vitest'

import { ReleaseGroup } from '../src/models/release_group.svelte'
import { Navigation } from '../src/navigation.svelte'

import type { Release } from '../src/models/release.svelte'

function group(repo: string, releaseCount: number): ReleaseGroup {
  const releaseGroup = new ReleaseGroup(repo)
  for (let i = 0; i < releaseCount; i += 1) {
    releaseGroup.releases.push({ data: { id: `${repo}-${i}` } } as Release)
  }
  return releaseGroup
}

function feed(): ReleaseGroup[] {
  return [group('a/one', 1), group('b/two', 2), group('c/three', 1)]
}

function selectedIndex(navigation: Navigation, groups: ReleaseGroup[]): number {
  return groups.findIndex((entry): boolean => navigation.isSelected(entry))
}

const GROUP_HEIGHT = 100

// jsdom lays nothing out, so the rects are supplied: groups stack GROUP_HEIGHT
// apart, with `firstOnScreen` at the top of the viewport.
function renderList(
  groups: ReleaseGroup[],
  firstOnScreen: number,
): { list: HTMLElement; scrolled: string[] } {
  const list = document.createElement('main')
  const scrolled: string[] = []

  groups.forEach((entry, index): void => {
    const top = (index - firstOnScreen) * GROUP_HEIGHT
    const element = document.createElement('div')
    element.dataset['groupKey'] = entry.key
    element.getBoundingClientRect = (): DOMRect =>
      ({ top, bottom: top + GROUP_HEIGHT }) as DOMRect
    element.scrollIntoView = (): void => {
      scrolled.push(entry.repo)
    }
    list.append(element)
  })

  return { list, scrolled }
}

// Dispatched, not constructed, so `event.target` is set for the guard.
function press(
  navigation: Navigation,
  init: KeyboardEventInit,
  target: EventTarget = document.createElement('div'),
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init })

  function handle(dispatched: Event): void {
    navigation.handleKey(dispatched as KeyboardEvent)
  }

  target.addEventListener('keydown', handle)
  target.dispatchEvent(event)
  target.removeEventListener('keydown', handle)

  return event
}

describe('Navigation', () => {
  describe('the first press', () => {
    it('enters at the topmost group on screen', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)
      navigation.listElement = renderList(groups, 1).list

      navigation.select(1)

      expect(selectedIndex(navigation, groups)).toBe(1)
    })

    it('falls back to the first group going down', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      navigation.select(1)

      expect(selectedIndex(navigation, groups)).toBe(0)
    })

    it('falls back to the last group going up', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      navigation.select(-1)

      expect(selectedIndex(navigation, groups)).toBe(2)
    })

    it('ignores an on-screen group that has left the feed', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)
      navigation.listElement = renderList([group('gone/away', 1)], 0).list

      navigation.select(1)

      expect(selectedIndex(navigation, groups)).toBe(0)
    })
  })

  describe('a cursor scrolled out of view', () => {
    it('re-enters beside the viewport instead of stepping from the cursor', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)
      navigation.listElement = renderList(groups, 0).list

      navigation.select(1)
      expect(selectedIndex(navigation, groups)).toBe(0)

      // The reader scrolls on; the cursor's group is now above the fold.
      navigation.listElement = renderList(groups, 2).list
      navigation.select(1)

      expect(selectedIndex(navigation, groups)).toBe(2)
    })

    it('steps normally while the cursor is still on screen', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)
      navigation.listElement = renderList(groups, 0).list

      navigation.select(1)
      navigation.select(1)

      expect(selectedIndex(navigation, groups)).toBe(1)
    })

    // Nothing rendered means nothing to measure, so the cursor has to stand.
    it('keeps the cursor when there is no rendered list', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      navigation.select(1)
      navigation.select(1)

      expect(selectedIndex(navigation, groups)).toBe(1)
    })
  })

  describe('moving', () => {
    it('steps down and back up', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      navigation.select(1)
      navigation.select(1)
      expect(selectedIndex(navigation, groups)).toBe(1)

      navigation.select(-1)
      expect(selectedIndex(navigation, groups)).toBe(0)
    })

    it('clamps at each end rather than wrapping', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      navigation.select(-1)
      navigation.select(1)
      expect(selectedIndex(navigation, groups)).toBe(2)

      navigation.select(-1)
      navigation.select(-1)
      navigation.select(-1)
      expect(selectedIndex(navigation, groups)).toBe(0)
    })

    it('re-enters from the top once the selected group leaves the feed', () => {
      let groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      navigation.select(1)
      groups = [group('x/nine', 1), group('y/ten', 1)]

      navigation.select(1)

      expect(selectedIndex(navigation, groups)).toBe(0)
    })
  })

  describe('unrenderable groups', () => {
    it('skips the empty caught-up group', () => {
      const caughtUp = group('__caught_up__', 0)
      caughtUp.showCaughtUp = true
      const groups = [group('a/one', 1), caughtUp]
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      navigation.select(1)
      navigation.select(1)

      expect(selectedIndex(navigation, groups)).toBe(0)
    })

    it('does nothing when no group is renderable', () => {
      const groups = [group('__caught_up__', 0)]
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      navigation.select(1)

      expect(selectedIndex(navigation, groups)).toBe(-1)
    })
  })

  describe('handleKey', () => {
    it('moves on the arrow keys and blocks the page scroll', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      const down = press(navigation, { key: 'ArrowDown' })
      expect(selectedIndex(navigation, groups)).toBe(0)
      expect(down.defaultPrevented).toBe(true)

      press(navigation, { key: 'ArrowDown' })
      expect(selectedIndex(navigation, groups)).toBe(1)

      press(navigation, { key: 'ArrowUp' })
      expect(selectedIndex(navigation, groups)).toBe(0)
    })

    it('leaves other keys alone', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      const event = press(navigation, { key: 'Enter' })

      expect(selectedIndex(navigation, groups)).toBe(-1)
      expect(event.defaultPrevented).toBe(false)
    })

    it('leaves a modified arrow key alone', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)

      const event = press(navigation, { key: 'ArrowDown', metaKey: true })

      expect(selectedIndex(navigation, groups)).toBe(-1)
      expect(event.defaultPrevented).toBe(false)
    })

    it('leaves the arrow keys to a focused form control', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)
      const input = document.createElement('input')

      const event = press(navigation, { key: 'ArrowDown' }, input)

      expect(selectedIndex(navigation, groups)).toBe(-1)
      expect(event.defaultPrevented).toBe(false)
    })
  })

  describe('scrolling', () => {
    it('scrolls the group the cursor lands on, once per press', () => {
      const groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)
      const rendered = renderList(groups, 0)
      navigation.listElement = rendered.list

      navigation.select(1)
      navigation.select(1)

      expect(rendered.scrolled).toEqual(['a/one', 'b/two'])
    })

    // The scroll used to live in an attachment, which re-ran on every re-derive.
    it('does not scroll when the groups re-derive on their own', () => {
      let groups = feed()
      const navigation = new Navigation((): ReleaseGroup[] => groups)
      const rendered = renderList(groups, 0)
      navigation.listElement = rendered.list

      navigation.select(1)
      groups = feed()

      expect(selectedIndex(navigation, groups)).toBe(0)
      expect(rendered.scrolled).toEqual(['a/one'])
    })
  })
})
