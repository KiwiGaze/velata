import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared flat ESLint config for the Velata workspace.
 *
 * @param {{ tsconfigRootDir: string }} options
 * @returns {import("typescript-eslint").ConfigArray}
 */
export function velataEslint({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: [
        "**/dist/**",
        "**/node_modules/**",
        "**/.turbo/**",
        "**/coverage/**",
        "apps/desktop/src-tauri/target/**",
        "apps/desktop/src-tauri/gen/**",
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
    },
    {
      files: ["**/*.{ts,tsx}"],
      plugins: {
        "react-hooks": reactHooks,
        "simple-import-sort": simpleImportSort,
      },
      rules: {
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "error",
        "simple-import-sort/imports": "error",
        "simple-import-sort/exports": "error",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/explicit-module-boundary-types": "error",
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { fixStyle: "inline-type-imports" },
        ],
      },
    },
    {
      files: ["**/*.{js,cjs,mjs}"],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: {
        globals: { ...globals.node },
      },
    },
    {
      files: ["**/*.config.{ts,mts,cts}"],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: {
        parserOptions: { projectService: false },
        globals: { ...globals.node },
      },
    },
    eslintConfigPrettier,
  );
}
