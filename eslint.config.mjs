import coreWebVitals from "eslint-config-next/core-web-vitals"
import typescript from "eslint-config-next/typescript"

/**
 * Flat config for the Next.js app router plus TypeScript. `core-web-vitals`
 * carries the React, hooks and next/* rules; `typescript` layers the
 * typescript-eslint recommended set over them.
 */
export default [
  {
    ignores: [
      ".next/**",
      "public/**",
      // Next regenerates this on every dev run and stamps it "should not be edited".
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // Build and asset scripts are Node programs, not browser code.
    files: ["scripts/**/*.mjs", "*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
  },
]
