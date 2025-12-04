import eslint from '@eslint/js'
import eslintPrettier from 'eslint-config-prettier'
import eslintSvelte from 'eslint-plugin-svelte'
import { defineConfig } from 'eslint/config'
// import oxlint from 'eslint-plugin-oxlint'
import globals from 'globals'
import eslintTS from 'typescript-eslint'

import svelteConfig from './svelte.config.js'

const svelteFiles = ['**/*.svelte', '**/*.svelte.{js,ts}']
const tsAndSvelteFiles = ['**/*.{js,ts}', ...svelteFiles]

export default defineConfig(
  {
    ...eslint.configs.all,
    files: tsAndSvelteFiles,
  },

  ...eslintTS.configs.all.map((cfg) => ({
    ...cfg,
    files: tsAndSvelteFiles,
  })),

  {
    files: tsAndSvelteFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        parser: eslintTS.parser,
        extraFileExtensions: ['.svelte'],
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'capitalized-comments': 'off',
      curly: 'off',
      'func-style': ['error', 'declaration'],
      'id-length': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-statements': 'off',
      'no-console': 'off',
      'no-inline-comments': 'off',
      'no-ternary': 'off',
      'no-undef-init': 'off',
      'no-undefined': 'off',
      'no-void': 'off',
      'one-var': 'off',
      'sort-imports': 'off',
      'sort-keys': 'off',

      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/no-magic-numbers': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: ['~/*', '@/*'],
        },
      ],
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
    },
  },

  ...eslintSvelte.configs.all.map((cfg) => ({
    ...cfg,
    files: svelteFiles,
  })),

  {
    ...eslintSvelte.configs.prettier.at(-1),
    files: svelteFiles,
  },

  {
    files: svelteFiles,
    languageOptions: {
      parserOptions: {
        svelteConfig,
      },
    },
    rules: {
      'prefer-const': 'off',
      'svelte/block-lang': [
        'error',
        {
          script: 'ts',
        },
      ],
      'svelte/consistent-selector-style': 'off',
      'svelte/experimental-require-strict-events': 'off',
      'svelte/no-navigation-without-base': 'off',
      'svelte/no-top-level-browser-globals': 'off',
    },
  },

  // TODO: Once OxLint is a bit more mature and we're sure that it picks up
  // everything that EsLint would, then we can uncomment this, which stops
  // EsLint from running rules that OxLint can handle
  // {
  //   extends: oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
  //   files: ['**/*.{js,ts}'],
  // },
)
