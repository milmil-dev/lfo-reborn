import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Ui, UiTint } from "./ui";

/*
  Buttons of the original client, from its HD skins (kit/ui):
    GlossButton  — blue title buttons (intro/intromenupack3b*, or a blank skin + live label)
    MetalButton  — grey menu buttons (a blank gamemenu skin + live label)
    IconButton   — O / X / arrows / create / delete squares (server/bu_*, profile/*, stage/*)
    TextPill     — REFRESH / CANCEL (server/refresh, server/lobbycancel)
*/

type Base = ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean };

const glow = "drop-shadow(0 0 6px #ffd447) drop-shadow(0 0 2px #ffd447)";

/** Blue title button. `skin` 1–3 uses the original (label baked in); otherwise a blank skin + label. */
export function GlossButton({
  active,
  skin,
  className,
  children,
  style,
  ...props
}: Base & { skin?: 1 | 2 | 3 }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "relative grid h-[36px] w-[141px] place-items-center transition duration-150",
        className,
      )}
      style={{ filter: active ? `${glow} brightness(1.12)` : undefined, ...style }}
    >
      <Ui
        name={skin ? `intro/intromenupack3b${skin}` : "derived/title_blank"}
        w={141}
        h={36}
        className="absolute inset-0"
      />
      {!skin && (
        <span className="relative font-bold text-[#0d1540] text-[17px] tracking-[0.1em] [-webkit-text-stroke:3px_#fff] [paint-order:stroke]">
          {children}
        </span>
      )}
    </button>
  );
}

/** Grey menu button: blank gamemenu skin + label; `active` lights it amber like a hover. */
export function MetalButton({ active, className, children, style, ...props }: Base) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "relative grid h-[38px] w-[182px] place-items-center transition duration-150 disabled:opacity-40",
        className,
      )}
      style={{ filter: active ? glow : undefined, ...style }}
    >
      <Ui name="derived/menu_blank" className="absolute inset-0 size-full" />
      {active && (
        <UiTint
          name="derived/menu_blank"
          color="rgb(255 200 40 / 0.5)"
          className="absolute inset-0 size-full mix-blend-overlay"
        />
      )}
      <span className="relative font-bold text-[16px] text-white tracking-[0.1em] [-webkit-text-stroke:3px_#555a62] [paint-order:stroke]">
        {children}
      </span>
    </button>
  );
}

export type GlyphName = "o" | "x" | "left" | "right" | "up" | "down" | "next" | "trash";

/** The original square buttons, picked by glyph and size. */
function iconSkin(glyph: GlyphName, w: number, h: number) {
  switch (glyph) {
    case "o":
      return w >= 60
        ? "profile/button_yes"
        : w >= 50
          ? "stage/stage_but_yes"
          : w >= 44
            ? "server/bu_ok"
            : "profile/profileok";
    case "x":
      return w >= 60 ? "profile/button_no" : w >= 50 ? "stage/stage_but_no" : "profile/profilex";
    case "left":
      return "server/bu_lef";
    case "right":
      return "server/bu_rig";
    case "up":
      return h >= 40 ? "profile/bu_up" : "stage/arrow_up";
    case "down":
      return h >= 40 ? "profile/bu_down" : "stage/arrow_down";
    case "next":
      return "profile/profilecreate";
    case "trash":
      return "profile/profiledelete";
  }
}

export function IconButton({
  glyph,
  w = 42,
  h = 47,
  active,
  className,
  style,
  ...props
}: Base & { glyph: GlyphName; w?: number; h?: number }) {
  const big = w >= 60;
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "relative transition duration-150 hover:brightness-110 disabled:opacity-40",
        className,
      )}
      style={{ width: w, height: h, filter: active && !big ? glow : undefined, ...style }}
    >
      {active && big && (
        <Ui
          name="profile/buttonlight"
          className="absolute -top-[4px] -left-[4px] h-[calc(100%+8px)] w-[calc(100%+8px)] animate-pulse"
        />
      )}
      <Ui name={iconSkin(glyph, w, h)} className="relative size-full" />
    </button>
  );
}

/** REFRESH / CANCEL pills (server/refresh, server/lobbycancel). */
export function TextPill({ skin, className, ...props }: Base & { skin: "refresh" | "cancel" }) {
  return (
    <button
      type="button"
      {...props}
      aria-label={skin === "refresh" ? "REFRESH" : "CANCEL"}
      className={cn("relative h-[34px] w-[121px] transition hover:brightness-110", className)}
    >
      <Ui
        name={skin === "refresh" ? "server/refresh" : "server/lobbycancel"}
        className="size-full"
      />
    </button>
  );
}

/** A caption under an icon button (the profile screen's create / delete / enter / back). */
export function Captioned({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-1 text-[11px] text-white/80">
      {children}
      {label}
    </span>
  );
}
