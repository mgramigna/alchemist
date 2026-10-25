import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  // The Router plugin must run before the React plugin.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  // Listen on all interfaces so the dev VM is reachable over Tailscale.
  server: { host: true, allowedHosts: ["solana", ".ts.net"] },
  build: { outDir: "dist" },
});
