import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Foundry dependency tree and Solidity sources (not linted by ESLint):
    "lib/**",
    "contracts/**",
    "test/contracts/**",
    "script/**",
    "cache/**",
    "broadcast/**",
  ]),
]);

export default eslintConfig;
