import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: {
      "@": `${import.meta.dirname}/src`,
    },
  },
  // The Router plugin must run before the React plugin.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  // Listen on all interfaces so the dev VM is reachable over Tailscale.
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ["solana", ".ts.net"],
    proxy: {
      // String shorthand enables changeOrigin and hides the browser-facing
      // origin from the Worker's strict auth checks. Preserve Host instead.
      "/api": { target: "http://127.0.0.1:1337", changeOrigin: false },
      "/auth": { target: "http://127.0.0.1:1337", changeOrigin: false },
      "/artwork": { target: "http://127.0.0.1:1337", changeOrigin: false },
    },
  },
  build: { outDir: "dist" },
});
