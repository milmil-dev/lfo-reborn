import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Ui } from "./ui";

/*
  Stage / mission select pieces from the client's HD art (stage/*): the STAGE | name bars
  (orange when chosen), the preview frame (map_select), the info panel and the "OK?" caption.
*/

export function StageBar({
  kind = "STAGE",
  bright,
  locked,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "STAGE" | "MISSION";
  bright?: boolean;
  locked?: boolean;
}) {
  const skin = `stage/${kind === "STAGE" ? "stagebar" : "missionbar"}_${bright ? "bright" : "dark"}`;
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "relative h-[47px] w-[410px] text-left text-white transition",
        bright && "drop-shadow-[0_0_10px_rgb(244_123_32/0.6)]",
        locked && !bright && "opacity-70",
        className,
      )}
    >
      <Ui name={skin} w={410} h={47} className="absolute inset-0" />
      <span className="absolute inset-y-0 right-[16px] left-[128px] flex items-center gap-2 truncate font-bold text-[17px] [text-shadow:0_1px_1px_rgb(0_0_0/0.4)]">
        {children}
      </span>
    </button>
  );
}

/** The preview frame (stage/map_select, 688 × 139); children show through its window. */
export function PreviewFrame({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative h-[139px] w-[688px]", className)}>
      <div className="absolute inset-[6px] overflow-hidden rounded-[14px]">{children}</div>
      <Ui name="stage/map_select" w={688} h={139} className="absolute inset-0" />
    </div>
  );
}

/** The tall translucent panel (stage/panel, 262 × 617), stretched to the box. */
export function InfoPanel({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <Ui name="stage/panel" className="absolute inset-0 size-full" />
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

export function OkCaption({ className }: { className?: string }) {
  return <Ui name="stage/stageselectok" w={118} h={28} className={className} alt="OK?" />;
}
