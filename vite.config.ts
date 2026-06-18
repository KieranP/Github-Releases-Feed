/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-bitwise -- lightningcss encodes targets as major << 16 */
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type UserConfig } from 'vite'

// https://vite.dev/config/
const config: UserConfig = defineConfig({
  base: '',
  plugins: [svelte()],
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
      // So performance.now() reports in microseconds
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
})

export default config
