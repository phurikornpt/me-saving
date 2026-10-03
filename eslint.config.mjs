import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// Clean Architecture: dependencies only point inward.
//   interface (app/api, lib, container) -> infrastructure -> application -> domain
const FRAMEWORKS = ["next", "react", "react-dom", "sequelize", "pg", "@google/genai", "next-auth"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "domain", pattern: "src/domain/**" },
        { type: "application", pattern: "src/application/**" },
        { type: "infrastructure", pattern: "src/infrastructure/**" },
        { type: "ui", pattern: ["src/components/**", "src/client/**"] },
        { type: "interface", pattern: ["src/app/**", "src/lib/**"] },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        2,
        {
          default: "allow",
          policies: [
            {
              from: { element: { type: "domain" } },
              disallow: {
                to: { element: { types: { anyOf: ["application", "infrastructure", "interface", "ui"] } } },
              },
            },
            {
              from: { element: { type: "application" } },
              disallow: {
                to: { element: { types: { anyOf: ["infrastructure", "interface", "ui"] } } },
              },
            },
            {
              from: { element: { type: "infrastructure" } },
              disallow: { to: { element: { types: { anyOf: ["interface", "ui"] } } } },
            },
            {
              // The UI (client) may only reach the pure domain, never the server layers.
              from: { element: { type: "ui" } },
              disallow: {
                to: { element: { types: { anyOf: ["application", "infrastructure", "interface"] } } },
              },
            },
          ],
        },
      ],
    },
  },
  {
    // Domain and application stay framework-free (domain also runs on the client).
    files: ["src/domain/**/*.ts", "src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: FRAMEWORKS.map((name) => ({
            name,
            message: "domain/application must not depend on frameworks; go through a port.",
          })),
          patterns: FRAMEWORKS.map((name) => `${name}/*`),
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
