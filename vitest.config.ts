import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    restoreMocks: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"]
  }
});
