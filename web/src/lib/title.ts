import { useEffect } from "react";

export const APP_NAME = "LFO Reborn";

/**
 * The browser tab's title for the screen on show: "第1話 學校 · LFO Reborn", or the bare name on
 * the title screen. Each screen calls it with its own (translated) name; a value still loading
 * (null) keeps the previous title rather than flashing the bare name.
 */
export function usePageTitle(page: string | null | undefined) {
  useEffect(() => {
    if (page === null) return;
    document.title = page ? `${page} · ${APP_NAME}` : APP_NAME;
  }, [page]);
}
