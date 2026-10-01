import { createReadStream, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwind from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

const here = dirname(fileURLToPath(import.meta.url));
// the release version (release-please bumps package.json), stamped into the build
const { version } = JSON.parse(readFileSync(resolve(here, "package.json"), "utf8")) as {
  version: string;
};

/*
  The pipeline's output (data/assets: art, UI, audio, JSON) is static: in dev and `vp preview`
  Vite serves it at /assets itself; the deployment (Cloudflare Workers static assets, wrangler.jsonc)
  unpacks the same tree into dist/assets after the build (deploy/publish-data.sh, .github/workflows/web.yml), so the build
  must never write under dist/assets/{game,ui-hd,dex}. VITE_ASSETS_URL can point elsewhere
  (src/lib/assets.ts). The Go server only answers /api.
*/
const ASSETS_DIR = resolve(here, "../data/assets");
const TYPES: Record<string, string> = {
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};
function serveAssets(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = resolve(ASSETS_DIR, `.${path}`);
  if (!file.startsWith(ASSETS_DIR + sep)) return next();
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(file);
  } catch {
    res.statusCode = 404;
    return res.end();
  }
  if (!st.isFile()) return next();
  const modified = st.mtime.toUTCString();
  // revalidate every time: a rebuilt data/ shows up without a hard reload
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Last-Modified", modified);
  if (req.headers["if-modified-since"] === modified) {
    res.statusCode = 304;
    return res.end();
  }
  res.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
  res.setHeader("Content-Length", st.size);
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}
const assets = {
  name: "lfo-assets",
  configureServer(server: {
    middlewares: { use: (path: string, fn: typeof serveAssets) => void };
  }) {
    server.middlewares.use("/assets", serveAssets);
  },
  configurePreviewServer(server: {
    middlewares: { use: (path: string, fn: typeof serveAssets) => void };
  }) {
    server.middlewares.use("/assets", serveAssets);
  },
};

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { "@": resolve(here, "./src") },
  },
  fmt: {
    // TanStack Router regenerates this with its own style on every `vp dev`
    ignorePatterns: ["dist/**", "src/routeTree.gen.ts", "src/i18n/locales/**"],
  },
  lint: {
    ignorePatterns: ["dist/**", "src/routeTree.gen.ts", "src/i18n/locales/**"],
    plugins: ["typescript", "react"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [{ files: ["**/*.{test,spec}.{ts,tsx}"], plugins: ["typescript", "vitest"] }],
  },
  staged: {
    "*.{js,ts,tsx}": "vp check --fix",
  },
  plugins: lazyPlugins(() => [
    // tanstackRouter must come before react()
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    // React Compiler via Babel; Lingui macros after the compiler
    babel({
      presets: [reactCompilerPreset()],
      plugins: ["@lingui/babel-plugin-lingui-macro"],
    }),
    tailwind(),
    lingui(),
    assets,
  ]),
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8080",
      "/openapi.yaml": "http://localhost:8080",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
