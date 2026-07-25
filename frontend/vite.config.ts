import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".");
  const runtimeEnv = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process?.env;
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": {
          target: runtimeEnv?.VITE_P2P_RELAY_TARGET || env.VITE_P2P_RELAY_TARGET || "http://localhost:8091",
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      environment: "node",
    },
  };
});
