/**
 * Pre-commit stays fast: Prettier only on staged files.
 * Run ESLint / typecheck manually or on push:
 *   npm run lint
 *   npm run typecheck
 */
export default {
  "src/**/*.{ts,js,json}": "prettier --write --ignore-unknown",
};
