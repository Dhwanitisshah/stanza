import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node", // prosody/timeline logic is pure, no DOM needed
    include: ["tests/**/*.test.ts"],
  },
});
