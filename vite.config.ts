/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-bitwise -- lightningcss encodes targets as major << 16 */
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type Plugin, type UserConfig } from 'vite'

// Dev serves every stylesheet as a script-created <style>, which style-src
// blocks. Loosen it here so the policy that ships stays strict.
function devInlineStyles(): Plugin {
  return {
    name: 'dev-inline-styles',
    apply: 'serve',
    transformIndexHtml(html: string): string {
      return html.replace(
        "style-src 'self'",
        "style-src 'self' 'unsafe-inline'",
      )
    },
  }
}

// https://vite.dev/config/
const config: UserConfig = defineConfig({
  base: '',
  plugins: [svelte(), devInlineStyles()],
  // Target anchor positioning's baseline so light-dark() stays native; both
  // options are needed (Vite ignores cssTarget for the lightningcss bundle).
  build: {
    cssTarget: ['chrome125', 'firefox147', 'safari26'],
  },
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: {
        chrome: 125 << 16,
        firefox: 147 << 16,
        safari: 26 << 16,
      },
    },
  },
  server: {
    headers: {
      // So performance.now() reports in microseconds. `credentialless` rather
      // than `require-corp`: release-note images carry no CORP header.
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})

export default config
