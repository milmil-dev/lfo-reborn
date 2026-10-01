import { i18n } from "@lingui/core";
import { I18nProvider as LinguiProvider } from "@lingui/react";
import type { ReactNode } from "react";
import { messages as zhHK } from "./locales/zh-HK/messages";

// UI copy is authored in zh-HK (the game's language); other locales load on demand later.
i18n.load("zh-HK", zhHK);
i18n.activate("zh-HK");

export { i18n };

export function I18nProvider({ children }: { children: ReactNode }) {
  return <LinguiProvider i18n={i18n}>{children}</LinguiProvider>;
}
