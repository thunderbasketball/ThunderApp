import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
export default defineConfig({
  resolve: { alias: { "@": import.meta.dirname } },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    env: loadEnv("test", process.cwd(), ""),
    // Database tests talk to Supabase over the internet.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
