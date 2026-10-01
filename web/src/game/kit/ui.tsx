import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { ASSETS } from "@/lib/assets";

/*
  The client's UI in HD: every piece in data/assets/ui upscaled 4× with AI super-resolution by
  pipeline/ui-hd.ts, so every original detail stays while edges stay sharp when scaled up.
  Pieces are drawn at their original CSS size; `name` is the original path,
  e.g. "chatpanel/chatpanelbody".
*/

export const UI_HD = `${ASSETS}/ui-hd`;
export const uiUrl = (name: string) => `${UI_HD}/${name}.webp`;

export function Ui({
  name,
  w,
  h,
  className,
  style,
  alt = "",
}: {
  name: string;
  w?: number;
  h?: number;
  className?: string;
  style?: CSSProperties;
  alt?: string;
}) {
  // declared as 4× density so the browser lays it out at the original size; explicit sizes go in
  // style because Tailwind's preflight (img { height: auto }) overrides width/height attributes
  return (
    <img
      src={uiUrl(name)}
      srcSet={`${uiUrl(name)} 4x`}
      alt={alt}
      className={cn("pointer-events-none block max-w-none select-none", className)}
      style={{ width: w, height: h, ...style }}
      draggable={false}
    />
  );
}

/** A solid colour cut to a piece's silhouette (tinting a white piece, highlighting a skin). */
export function UiTint({
  name,
  color,
  className,
  style,
}: {
  name: string;
  color: string;
  className?: string;
  style?: CSSProperties;
}) {
  const mask = `url(${uiUrl(name)}) center / 100% 100% no-repeat`;
  return (
    <span
      className={cn("pointer-events-none block", className)}
      style={{ background: color, mask, WebkitMask: mask, ...style }}
    />
  );
}
