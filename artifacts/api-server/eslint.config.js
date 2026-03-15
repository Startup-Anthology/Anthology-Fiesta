import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      // TypeScript module augmentation patterns (e.g. declare global { namespace Express {} })
      '@typescript-eslint/no-namespace': 'off',
      // Empty interface extending another type is a valid TS augmentation pattern
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'build.ts'],
  }
);
