/* eslint-disable @typescript-eslint/naming-convention */
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type UserConfig } from 'vite'

// https://vite.dev/config/
const config: UserConfig = defineConfig({
  base: '',
  plugins: [svelte()],
  css: {
    transformer: 'lightningcss',
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
