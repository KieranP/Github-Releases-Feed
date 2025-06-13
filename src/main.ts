import './reset.css'
import './global.css'

import { mount } from 'svelte'
import App from './App.svelte'

mount(App, {
  // oxlint-disable-next-line typescript/no-non-null-assertion
  target: document.querySelector('#app')!,
})
