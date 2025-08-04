import eslint from '@eslint/js'
import eslintTS from 'typescript-eslint'
import eslintPrettier from 'eslint-config-prettier'
import eslintSvelte from 'eslint-plugin-svelte'
import svelteConfig from './svelte.config.js'
import oxlint from 'eslint-plugin-oxlint'
import globals from 'globals'

const svelteFiles = ['**/*.svelte', '**/*.svelte.{js,ts}']
const tsAndSvelteFiles = ['**/*.{js,ts}', ...svelteFiles]

export default eslintTS.config(
  {
    extends: [
      eslint.configs.recommended,
      eslintTS.configs.strictTypeChecked,
      eslintTS.configs.stylisticTypeChecked.at(-1),
      eslintPrettier,
    ],
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
      // ESLint Rules
      'array-callback-return': 'error',
      'block-scoped-var': 'error',
      'default-case': 'error',
      'default-case-last': 'error',
      eqeqeq: 'error',
      'logical-assignment-operators': 'error',
      'no-await-in-loop': 'error',
      'no-constructor-return': 'error',
      'no-duplicate-imports': 'error',
      'no-eq-null': 'error',
      'no-eval': 'error',
      'no-implicit-coercion': 'error',
      'no-inner-declarations': 'error',
      'no-lonely-if': 'error',
      'no-negated-condition': 'error',
      'no-nested-ternary': 'error',
      'no-new': 'error',
      'no-new-func': 'error',
      'no-param-reassign': 'error',
      'no-promise-executor-return': 'error',
      'no-return-assign': 'error',
      'no-script-url': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-throw-literal': 'error',
      'no-unassigned-vars': 'error',
      // 'no-undefined': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unneeded-ternary': 'error',
      'no-unreachable-loop': 'error',
      'no-useless-assignment': 'error',
      'no-useless-call': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'error',
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-const': 'error',
      'prefer-object-has-own': 'error',
      'prefer-object-spread': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      'require-atomic-updates': 'error',

      // Disable ESLint Rules (TS/Svelte versions below)
      'class-methods-use-this': 'off',
      'consistent-return': 'off',
      'default-param-last': 'off',
      'no-dupe-class-members': 'off',
      'no-invalid-this': 'off',
      'no-loop-func': 'off',
      'no-redeclare': 'off',
      'no-restricted-imports': 'off',
      'no-shadow': 'off',
      'no-use-before-define': 'off',

      // TSLint Rules
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/class-methods-use-this': 'error',
      '@typescript-eslint/consistent-return': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/default-param-last': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-member-accessibility': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/member-ordering': 'error',
      '@typescript-eslint/method-signature-style': 'error',
      '@typescript-eslint/no-dupe-class-members': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-invalid-this': 'error',
      '@typescript-eslint/no-loop-func': 'error',
      '@typescript-eslint/no-redeclare': 'error',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: ['~/*', '@/*'],
        },
      ],
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unnecessary-parameter-property-assignment':
        'error',
      '@typescript-eslint/no-unnecessary-qualifier': 'error',
      '@typescript-eslint/no-unnecessary-type-conversion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // '@typescript-eslint/no-use-before-define': 'error',
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/prefer-enum-initializers': 'error',
      // '@typescript-eslint/prefer-readonly-parameter-types': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
        },
      ],
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          considerDefaultExhaustiveForUnions: true,
          requireDefaultForNonUnion: true,
        },
      ],
    },
  },

  {
    extends: [
      eslintSvelte.configs.recommended,
      eslintSvelte.configs.prettier.at(-1),
    ],
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
      'svelte/button-has-type': 'error',
      'svelte/no-inline-styles': 'error',
      'svelte/no-target-blank': 'error',
      'svelte/prefer-class-directive': 'error',
      'svelte/prefer-const': 'error',
      'svelte/prefer-style-directive': 'error',
      'svelte/shorthand-attribute': 'error',
      'svelte/shorthand-directive': 'error',
      'svelte/sort-attributes': 'error',
    },
  },

  {
    extends: oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
    files: ['**/*.{js,ts}'],
  },
)
