import './reset.css'
import './global.css'

import { mount } from 'svelte'
import App from './App.svelte'

mount(App, {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  target: document.getElementById('app')!,
})
