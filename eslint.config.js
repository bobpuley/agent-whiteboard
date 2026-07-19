import js from "@eslint/js";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "test-results/**",
      "docs/**",
      "mockup/**",
      "media/**",
      ".idea/**",
      ".claude/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs["flat/recommended"],
  {
    files: ["**/*.svelte"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ["server/**/*.ts", "scripts/**/*", "bin/**/*", "*.config.{js,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["client/**/*.{ts,svelte}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["tests/**/*"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // Scoped conservatively (v0.20, see M1 in docs/02_assumptions-and-risks.md):
    // catch real bugs, don't gate on full stylistic conformance yet.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.svelte"],
    rules: {
      // The Mermaid/KaTeX/Html renderers deliberately inject sanitized
      // (DOMPurify) markup via direct DOM access — that's the renderer
      // architecture (see `04_architecture.md` §1 rendering libraries),
      // not a bug the linter should flag.
      "svelte/no-dom-manipulating": "off",
      // False positive on the common `$: { ...; flag = current; }` pattern,
      // where the assignment is read on the *next* reactive re-run, not
      // the current one — the rule doesn't model that carry-over.
      "no-useless-assignment": "off",
    },
  },
);
