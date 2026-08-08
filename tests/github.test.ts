import { describe, expect, it } from 'vitest'

import { stabiliseAssetUrls } from '../src/github'

const JWT =
  'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIn0.Kd-NmaXvFuSgz_WqoSkePL2nhR'
const UUID = 'c6664c38-9898-4886-929d-8d091323fa82'
const SIGNED = `https://private-user-images.githubusercontent.com/554369/585885828-${UUID}.png?jwt=${JWT}`
const STABLE = `https://github.com/user-attachments/assets/${UUID}`

describe('stabiliseAssetUrls', () => {
  it('rewrites a signed attachment URL to its permanent form', () => {
    expect(stabiliseAssetUrls(`<img src="${SIGNED}">`)).toBe(
      `<img src="${STABLE}">`,
    )
  })

  it('rewrites every occurrence, including the wrapping link', () => {
    const html = `<a href="${SIGNED}"><img alt="a" src="${SIGNED}"></a>`

    expect(stabiliseAssetUrls(html)).toBe(
      `<a href="${STABLE}"><img alt="a" src="${STABLE}"></a>`,
    )
  })

  it('leaves URLs that never expire alone', () => {
    const html = [
      '<img src="https://user-images.githubusercontent.com/554369/1-a.png">',
      '<img src="https://camo.githubusercontent.com/abc123/def">',
      '<a href="https://github.com/owner/repo/releases/tag/v1">v1</a>',
    ].join('')

    expect(stabiliseAssetUrls(html)).toBe(html)
  })

  it('returns unchanged HTML when there are no attachments', () => {
    expect(stabiliseAssetUrls('<p>No images here.</p>')).toBe(
      '<p>No images here.</p>',
    )
  })
})
