/*
  The build stamp: the release version (web/package.json, bumped by release-please) and the
  commit CI built (VITE_GIT_SHA), or "dev" for a local build.
*/
export const VERSION = __APP_VERSION__;
export const COMMIT = (import.meta.env.VITE_GIT_SHA ?? "").slice(0, 7) || "dev";
/** "v0.1.0 · 1a2b3c4" */
export const BUILD = `v${VERSION} · ${COMMIT}`;
