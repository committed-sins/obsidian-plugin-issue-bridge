import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default defineConfig([
  globalIgnores(['node_modules/**', 'dist/**', 'vendor/**', 'tests/**', 'scripts/**', 'eslint.config.mjs']),
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { parserOptions: { projectService: true } }
  }
]);
