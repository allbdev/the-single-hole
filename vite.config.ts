import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/ws": { target: "ws://localhost:8787", ws: true } },
  },
  build: { target: "es2022", sourcemap: true, chunkSizeWarningLimit: 900 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
  },
});
