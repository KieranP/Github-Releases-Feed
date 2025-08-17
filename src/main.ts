import './reset.css'
import './global.css'

import { mount } from 'svelte'

import App from './App.svelte'

mount(App, {
  // oxlint-disable-next-line typescript/no-non-null-assertion
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  target: document.querySelector('#app')!,
})
