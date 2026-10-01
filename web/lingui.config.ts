import { defineConfig } from "@lingui/cli";

// Game data is Chinese; the UI chrome is written in zh-HK and translated out from there.
export default defineConfig({
  locales: ["zh-HK", "en"],
  sourceLocale: "zh-HK",
  compileNamespace: "es",
  catalogs: [{ path: "src/i18n/locales/{locale}/messages", include: ["src"] }],
});
