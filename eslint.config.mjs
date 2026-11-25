import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Single flat config for the whole monorepo; each package's `lint` script runs `eslint .`
// from its own directory and ESLint resolves this file by walking up.
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/drizzle/**", "**/.turbo/**", "apps/web/vite.config.ts.timestamp-*"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["apps/api/**/*.ts", "apps/bank-sync/**/*.ts", "packages/**/*.ts", "*.config.{js,ts}", "apps/*/*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // shadcn/ui primitives co-export variant helpers next to the component by design.
    files: ["apps/web/src/components/ui/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
