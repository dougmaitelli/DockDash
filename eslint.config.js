import ts from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import prettier from "eslint-plugin-prettier/recommended";

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": ts,
      import: importPlugin,
      react,
      "react-hooks": reactHooks,
      "simple-import-sort": simpleImportSort,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "import/first": "error",
      "import/newline-after-import": "error",
      "no-console": "error",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-unused-vars": "off",
      ...reactHooks.configs.recommended.rules,
      "react-hooks/set-state-in-effect": "off",
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            // External packages
            ["^react", "^@?\\w"],
            // @shared alias
            ["^@shared"],
            // @ alias (internal components, hooks, etc.)
            ["^@/"],
            // Relative imports
            ["^\\."],
            // CSS side effects
            ["^.+\\.css$"],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
      "padding-line-between-statements": [
        "warn",
        { blankLine: "always", prev: "*", next: "return" },
        { blankLine: "always", prev: ["const", "let", "var"], next: "*" },
        { blankLine: "any", prev: ["const", "let", "var"], next: ["const", "let", "var"] },
        { blankLine: "always", prev: "*", next: ["if", "for", "while", "switch"] },
        { blankLine: "always", prev: ["if", "for", "while", "switch"], next: "*" },
      ],
    },
  },
  {
    files: ["**/lib/logService.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
  prettier,
];
