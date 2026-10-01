/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** base URL of the static game assets (data/assets); default /assets — dev and preview serve
   * it from Vite, the Pages deployment ships it inside dist/assets */
  readonly VITE_ASSETS_URL?: string;
  /** the commit a CI build was made from (web.yml passes github.sha) */
  readonly VITE_GIT_SHA?: string;
}

/** web/package.json's version, which release-please bumps (vite.config.ts `define`) */
declare const __APP_VERSION__: string;
