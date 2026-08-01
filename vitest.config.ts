import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    include: ["apps/**/test/**/*.test.ts", "packages/**/test/**/*.test.ts"],
  },
});
