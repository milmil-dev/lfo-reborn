/**
 * Where the pipeline's static files (data/assets: game art, UI, audio, JSON) are served from.
 * Dev and `vp preview` serve data/assets at /assets themselves (vite.config.ts); a deployment
 * points VITE_ASSETS_URL at the CDN / bucket holding the same tree. The Go API never serves them.
 */
export const ASSETS = (import.meta.env.VITE_ASSETS_URL ?? "/assets").replace(/\/$/, "");
