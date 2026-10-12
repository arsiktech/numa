import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const reactHooksClassicRules = {
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "warn"
};

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      ".vercel",
      "test-results",
      "playwright-report",
      "convex/_generated",
      "**/*.d.ts",
      "outputs/brand/numa-shared-2027/**",
      "ios/Numa/build-device/**",
      // Local scratch (gitignored): QA scripts, generated reports, refactor tmp.
      "tmp/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ["scripts/design-sweep.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      }
    }
  },
  {
    files: ["public/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        URL: "readonly"
      }
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module"
      }
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh
    },
    rules: {
      ...reactHooksClassicRules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    // Ratchet against god files: warn when a module crosses ~800 real lines
    // (blanks/comments excluded). Surfaces the large route/server files as
    // visible debt and stops new ones from growing unnoticed. Tests and the
    // generated i18n dictionaries are exempt — length there is inherent.
    files: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
    ignores: ["**/*.test.{ts,tsx}", "src/lib/locales/**", "convex/_generated/**"],
    rules: {
      "max-lines": ["warn", { max: 800, skipBlankLines: true, skipComments: true }]
    }
  },
  {
    files: ["src/services/**/*.{ts,tsx}"],
    rules: {
      // Service modules intentionally export providers, hooks, and action
      // helpers together. The Fast Refresh component-export rule is useful for
      // UI modules, but it turns these app-state modules into lint noise.
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: ["src/App.tsx"],
    rules: {
      // Route tree modules naturally colocate route guards, lazy route setup,
      // and the exported router object. Moving those guards out only for Fast
      // Refresh would make the auth/onboarding routing harder to audit.
      "react-refresh/only-export-components": "off"
    }
  },
  {
    files: ["src/components/features/CategoryIcon.tsx"],
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowExportNames: ["toneForCategoryColor", "tonesFor"]
        }
      ]
    }
  }
);
