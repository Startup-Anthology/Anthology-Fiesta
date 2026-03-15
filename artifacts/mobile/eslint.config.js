const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expo,
  {
    rules: {
      // Apostrophes and quotes in natural-language JSX text don't need HTML escaping
      'react/no-unescaped-entities': 'off',
      // Expo's FileSystem namespace types aren't fully reflected in the import plugin
      'import/namespace': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'scripts/**',
      'server/**',
      'expo-env.d.ts',
    ],
  },
]);
