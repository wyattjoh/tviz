/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Nested git worktrees live under `.claude/worktrees/`; keep Vite's watcher and
 * dependency scanner out of them.
 */
const worktrees = fileURLToPath(new URL("./.claude/worktrees/**", import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vite consumes `server` only for `vite` development servers. Production
  // builds ignore it, and `vite preview` has a separate `preview` namespace.
  server: {
    // On macOS, Vite's `localhost` default can bind IPv6 only. Tailscale Serve
    // proxies a port through IPv4 loopback, so that otherwise ends in a 502.
    host: "127.0.0.1",
    // Serve forwards the tailnet hostname. Allow MagicDNS names without baking
    // one person's hostname into the public repo or disabling Vite's host check.
    allowedHosts: [".ts.net"],
    watch: { ignored: [worktrees] },
  },
  test: {
    // Parser tests are plain Node; component tests opt into jsdom with a
    // `@vitest-environment` docblock.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    // Vitest replaces CSS imports with an empty string unless this is on, and
    // `src/ui/tokens.test.ts` reads `src/index.css` as text to measure what the
    // semantic tokens resolve to.
    css: true,
    restoreMocks: true,
  },
});
