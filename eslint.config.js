// P1: ESLint flat config for ShapeShift.
//
// The project is dependency-free and ships no bundler — content scripts are
// plain <script> tags with shared globals assigned to globalThis. This config
// uses only built-in rules (no @eslint/js dependency) and SUPPLEMENTS (not
// replaces) the regex gates in verify.mjs, which enforce project-specific
// invariants like no Math.random in seed paths and no network calls.
export default [
  {
    files: [
      'core/**/*.js',
      'content/**/*.js',
      'background/**/*.js',
      'popup/**/*.js',
      'options/**/*.js',
    ],
    ignores: ['dist/**', 'scripts/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      // The runtime scripts share globals via globalThis ss* assignments.
      globals: {
        chrome: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      // Project-specific: the seed chain must never call Math.random.
      // verify.mjs pins this via regex; ESLint catches it during edit.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded PRNG from core/prng.js',
        },
      ],
      // General hygiene
      'no-undef': 'warn',
      'no-unused-vars': 'warn',
      'no-redeclare': 'error',
      'no-fallthrough': 'error',
    },
  },
  {
    files: ['scripts/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'warn',
    },
  },
];
