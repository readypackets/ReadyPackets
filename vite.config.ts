/**
 * Vite build configuration.
 *
 * Deliberately minimal: the React plugin and nothing else. No analytics, no
 * remote font loader, no CDN rewriting, and no runtime injection plugin. The
 * built bundle therefore makes zero third-party requests, which is what allows
 * a Content Security Policy with no external origins.
 */
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Stamp `nonce="__CSP_NONCE__"` onto every script and stylesheet tag Vite emits
 * into the built HTML.
 *
 * The server replaces the placeholder with a fresh per-request nonce when it
 * serves the shell. Without this, the strict CSP would block the bundle, and the
 * usual workaround — adding `'unsafe-inline'` or hashing at deploy time — is
 * exactly what we are refusing to do.
 */
function cspNoncePlugin(): Plugin {
  return {
    name: "readypackets-csp-nonce",
    enforce: "post",
    apply: "build",
    transformIndexHtml(html) {
      return html
        .replace(/<script(?![^>]*\bnonce=)/g, '<script nonce="__CSP_NONCE__"')
        .replace(
          /<link([^>]*\brel="(?:stylesheet|modulepreload)"[^>]*)>/g,
          (match, attributes: string) =>
            attributes.includes("nonce=")
              ? match
              : `<link nonce="__CSP_NONCE__"${attributes}>`,
        );
    },
  };
}

export default defineConfig({
  root: path.join(here, "client"),
  base: "/",
  plugins: [
    react(),
    cspNoncePlugin(),
  ],
  resolve: {
    alias: {
      "@": path.join(here, "client", "src"),
      "@shared": path.join(here, "shared"),
      "@server": path.join(here, "server"),
    },
  },
  build: {
    outDir: path.join(here, "client", "dist"),
    emptyOutDir: true,
    // Source maps are not published: they would hand an attacker the original
    // module layout and comments.
    sourcemap: false,
    target: "es2022",
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Content-hashed filenames make the immutable cache policy safe.
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // React ecosystem must be a single chunk to avoid circular
          // initialisation errors. react, react-dom, react-router, and
          // scheduler all share internal module-level state and must
          // initialise in a deterministic order. Splitting them across
          // chunks that have cross-references produces the
          // "Cannot set properties of undefined (setting 'Activity')"
          // crash that shows as a blank white page.
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router/") ||
            id.includes("/scheduler/") ||
            id.includes("/use-sync-external-store/")
          ) {
            return "react";
          }

          // tRPC + TanStack Query share peer deps with React; keep them
          // in their own chunk so they can import from "react" cleanly.
          if (id.includes("/@trpc/") || id.includes("/@tanstack/")) {
            return "data";
          }

          if (id.includes("/lucide-react/")) return "icons";
          if (id.includes("/recharts/") || id.includes("/d3-")) return "charts";

          // Everything else goes to vendor. Do NOT put wouter or any
          // package that imports react here — vendor is loaded before
          // react and a forward reference produces the init crash above.
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: false,
      },
    },
  },
  preview: { port: 4173, host: "127.0.0.1" },
  esbuild: {
    // Strip developer noise from the production bundle.
    drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
    legalComments: "none",
  },
});
