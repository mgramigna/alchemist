// PROTOTYPE — throwaway Vite config for the Script editor prototype (#15).
// Binds to the Tailscale interface when there is one (e.g. http://solana:5199),
// so it's reachable over the tailnet without exposing it on a public interface.
import react from "@vitejs/plugin-react";
import { networkInterfaces } from "node:os";
import { defineConfig } from "vite";

const tailscale = networkInterfaces().tailscale0?.find((a) => a.family === "IPv4")?.address;

export default defineConfig({
  plugins: [react()],
  server: { port: 5199, host: tailscale ?? "localhost", allowedHosts: ["solana", ".ts.net"] },
});
