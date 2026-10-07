// Standard TanStack Start + Vite config (replaces @lovable.dev/vite-tanstack-config).
// Same plugin set the Lovable wrapper used, minus its sandbox/preview/publish hooks:
//   TanStack devtools (dev only), Tailwind, tsconfig paths, TanStack Start,
//   Nitro (build only, Cloudflare Workers target), React.
import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig(({ command, mode }) => ({
  plugins: [
    ...(mode === "development"
      ? [
          devtools({
            logging: false,
            eventBusConfig: { enabled: false },
            enhancedLogs: { enabled: false },
            consolePiping: { enabled: false },
            removeDevtoolsOnBuild: false,
            injectSource: { enabled: true },
          }),
        ]
      : []),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Never let server-only modules leak into the browser bundle.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // TanStack Start's server entry is src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    ...(command === "build"
      ? [
          nitro({
            preset: "cloudflare-module",
            cloudflare: { nodeCompat: true, deployConfig: true },
          }),
        ]
      : []),
    viteReact(),
  ],
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  server: { host: "::", port: 8080 },
}));
