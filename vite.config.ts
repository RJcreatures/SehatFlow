import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  server: {
    // Tailscale Serve / Funnel sends the machine hostname as Host.
    allowedHosts: ["macbook-pro.taildd20ee.ts.net", ".ts.net"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
