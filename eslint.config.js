import eslint from '@eslint/js'
import eslintTS from 'typescript-eslint'
import eslintPrettier from 'eslint-config-prettier'
import eslintSvelte from 'eslint-plugin-svelte'
import svelteParser from 'svelte-eslint-parser'
import globals from 'globals'

export default eslintTS.config(
  {
    ignores: ['**/.DS_Store', '**/.env.*', '**/node_modules/'],
  },

  // Enable Linting Rules
  ...[
    {
      ...eslint.configs.recommended,
      files: ['**/*.{js,ts,svelte}'],
    },

    ...eslintTS.configs.strictTypeChecked.map((config) => ({
      ...config,
      files: ['**/*.{js,ts,svelte}'],
    })),

    ...eslintTS.configs.stylisticTypeChecked.map((config) => ({
      ...config,
      files: ['**/*.{js,ts,svelte}'],
    })),

    ...eslintSvelte.configs.base,

    ...eslintSvelte.configs.recommended.map((config) => ({
      ...config,
      files: ['**/*.svelte'],
    })),
  ],

  // Prettier Compatability
  ...[
    {
      ...eslintPrettier,
      files: ['**/*.{js,ts,svelte}'],
    },

    ...eslintSvelte.configs.prettier.map((config) => ({
      ...config,
      files: ['**/*.svelte'],
    })),
  ],

  //
  // Enabled/Disabled Rules
  //

  {
    files: ['**/*.{js,ts,svelte}'],
    rules: {
      // Enable ESLint Rules
      'array-callback-return': 'error',
      eqeqeq: 'error',
      'no-await-in-loop': 'error',
      'no-constructor-return': 'error',
      'no-duplicate-imports': 'error',
      'no-inner-declarations': 'error',
      'no-lonely-if': 'error',
      'no-negated-condition': 'error',
      'no-promise-executor-return': 'error',
      'no-return-assign': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unneeded-ternary': 'error',
      'no-unreachable-loop': 'error',
      'no-useless-assignment': 'error',
      'no-useless-concat': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-object-spread': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',
      'prefer-template': 'error',
      'require-atomic-updates': 'error',

      // Disable ESLint Rules (TS/Svelte versions below)
      'consistent-return': 'off',
      'default-param-last': 'off',
      'no-dupe-class-members': 'off',
      'no-invalid-this': 'off',
      'no-loop-func': 'off',
      'no-redeclare': 'off',
      'no-restricted-imports': 'off',
      'no-shadow': 'off',
      'no-use-before-define': 'off',
      'prefer-const': 'off',

      // Enable TSLint Rules
      '@typescript-eslint/consistent-return': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/default-param-last': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
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
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/prefer-enum-initializers': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          considerDefaultExhaustiveForUnions: true,
          requireDefaultForNonUnion: true,
        },
      ],

      // Override TSLint Rules
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
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
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
        },
      ],

      // Enable Svelte Rules
      'svelte/button-has-type': 'error',
      'svelte/no-dom-manipulating': 'error',
      'svelte/no-dupe-on-directives': 'error',
      'svelte/no-dupe-use-directives': 'error',
      'svelte/no-inline-styles': 'error',
      'svelte/no-inspect': 'error',
      'svelte/no-reactive-functions': 'error',
      'svelte/no-reactive-literals': 'error',
      'svelte/no-reactive-reassign': 'error',
      'svelte/no-svelte-internal': 'error',
      'svelte/no-target-blank': 'error',
      'svelte/no-unused-class-name': 'error',
      'svelte/no-useless-children-snippet': 'error',
      'svelte/no-useless-mustaches': 'error',
      'svelte/prefer-class-directive': 'error',
      'svelte/prefer-const': 'error',
      'svelte/require-each-key': 'error',
      'svelte/require-store-reactive-access': 'error',
      'svelte/sort-attributes': 'error',
      'svelte/valid-each-key': 'error',
    },
  },

  //
  // Other Tweaks
  //

  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        parser: eslintTS.parser,
      },
    },
  },

  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        projectService: true,
        parser: eslintTS.parser,
        extraFileExtensions: ['.svelte'],
      },
      globals: {
        ...globals.browser,
      },
    },
  },
)
