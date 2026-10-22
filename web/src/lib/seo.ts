import { useEffect } from "react";

export const APP_NAME = "LFO Reborn";
/** The origin the site is served from: the head in index.html is static, so it is written out. */
export const SITE_URL = "https://www.lforeborn.v6.rocks";
export const OG_IMAGE = `${SITE_URL}/og.png`;
export const HOME_TITLE = `${APP_NAME} — 小鬥士 Online 網頁重製版`;
export const DEFAULT_DESCRIPTION =
  "《小鬥士 Online》(LFO) 網頁重製版——以原版客戶端的美術與招式資料重建，收錄歷代角色與關卡，可即時訓練、遊玩故事模式與任務。";

const INDEXABLE = "index, follow, max-image-preview:large, max-snippet:-1";
const HIDDEN = "noindex, follow";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.append(el);
  }
  if (el.getAttribute("content") !== content) el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.append(el);
  }
  if (el.getAttribute("href") !== href) el.setAttribute("href", href);
}

/**
 * The head for the screen on show: tab title, description, canonical URL and the Open Graph /
 * Twitter tags a link preview reads. index.html carries the title screen's tags for crawlers
 * that never run the app; this keeps them true as the player moves between screens.
 *
 * `page` is the screen's own (translated) name — "" for the title screen, null while its name
 * is still loading, which leaves the previous screen's tags alone rather than flashing the
 * bare name. `description` falls back to the site's. `noindex` keeps dev pages and live room
 * codes out of search results.
 */
export function usePageMeta(
  page: string | null | undefined,
  description?: string,
  { noindex = false }: { noindex?: boolean } = {},
) {
  useEffect(() => {
    if (page === null) return;
    const title = page ? `${page} · ${APP_NAME}` : HOME_TITLE;
    const desc = description || DEFAULT_DESCRIPTION;
    const url = SITE_URL + location.pathname;
    document.title = title;
    setMeta("name", "description", desc);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", OG_IMAGE);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", desc);
    setMeta("name", "twitter:image", OG_IMAGE);
    setMeta("name", "robots", noindex ? HIDDEN : INDEXABLE);
    setCanonical(url);
  }, [page, description, noindex]);
}
