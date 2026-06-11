import { defineConfig, type OxfmtConfig } from 'oxfmt'

// https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html
// https://oxc.rs/docs/guide/usage/formatter/sorting
const config: OxfmtConfig = defineConfig({
  arrowParens: 'always',
  bracketSameLine: false,
  bracketSpacing: true,
  insertFinalNewline: true,
  objectWrap: 'preserve',
  printWidth: 80,
  quoteProps: 'as-needed',
  semi: false,
  singleAttributePerLine: true,
  singleQuote: true,
  sortImports: {
    customGroups: [
      {
        groupName: 'svelte',
        elementNamePattern: ['svelte', 'svelte/*'],
      },
    ],
    groups: [
      'side_effect_style',
      'side_effect',
      'style',
      'svelte',
      ['value-builtin', 'value-external'],
      ['value-internal', 'value-subpath'],
      ['value-parent', 'value-sibling', 'value-index'],
      'unknown',
      ['type-builtin', 'type-external'],
      ['type-internal', 'type-subpath'],
      ['type-parent', 'type-sibling', 'type-index'],
    ],
  },
  svelte: true,
  tabWidth: 2,
  trailingComma: 'all',
  useTabs: false,
})

export default config
