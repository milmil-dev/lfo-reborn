import { motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Ui } from "./ui";

/*
  Frames and ornaments of the original client from its HD pieces: the status box
  (bigheadbox), the dialogue nine-slice (dialog0–8), the profile screen's selection frame,
  brackets, rings, arrows, name box, the NOT AVAILABLE card, speech bubbles.
*/

/** The translucent status panel with its pipe clamp (gameinterface/default/bigheadbox, 184 × 118). */
export function StatusPanel({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn("relative h-[118px] w-[184px]", className)}>
      <Ui name="gameinterface/default/bigheadbox" w={184} h={118} className="absolute inset-0" />
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

/** One top corner of the dialogue box (dialog0 / dialog2, 98 × 81). */
export function PipeArch({ flip, className }: { flip?: boolean; className?: string }) {
  return (
    <Ui name={`gameinterface/default/dialog${flip ? 2 : 0}`} w={98} h={81} className={className} />
  );
}

/**
 * The dialogue box (dialog0–8): a tinted glass body fills the whole box, and the pipe-work
 * nine-slice (open corners, stretched edges) is laid over it.
 */
export function DialogFrame({ children, className }: { children: ReactNode; className?: string }) {
  const p = (n: number) => `gameinterface/default/dialog${n}`;
  return (
    <div className={cn("relative", className)}>
      {/* dialog4 is a plain white texture the client tints when drawing: the talk box is dark glass */}
      <div className="absolute top-[14px] right-[6px] bottom-[4px] left-[6px] rounded-[14px] bg-[#0a0f16]/75 backdrop-blur-[2px]" />
      <div className="absolute inset-0 grid grid-cols-[98px_1fr_98px] grid-rows-[81px_1fr_18px]">
        <Ui name={p(0)} className="size-full" />
        <Ui name={p(1)} className="size-full" />
        <Ui name={p(2)} className="size-full" />
        <Ui name={p(3)} className="size-full" />
        <span />
        <Ui name={p(5)} className="size-full" />
        <Ui name={p(6)} className="size-full" />
        <Ui name={p(7)} className="size-full" />
        <Ui name={p(8)} className="size-full" />
      </div>
      <div className="absolute inset-0 px-[34px] pt-[26px] pb-[22px]">{children}</div>
    </div>
  );
}

/** Cyan frame around the chosen head (profile/select, 85 × 101). */
export function SelectFrame({ className }: { className?: string }) {
  return <Ui name="profile/select" className={cn("size-full", className)} />;
}

/** One side of the profile screen's brackets (profile/bracket, 117 × 352). */
export function Bracket({ flip, className }: { flip?: boolean; className?: string }) {
  return (
    <Ui
      name="profile/bracket"
      w={117}
      h={352}
      className={className}
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}

/** Spinning ring (profile/moving_circle1–3: 95, 62, 57 px). */
export function Ring({
  size,
  className,
  seconds = 6,
  reverse,
}: {
  size: number;
  className?: string;
  seconds?: number;
  reverse?: boolean;
}) {
  const n = size >= 90 ? 1 : size >= 60 ? 2 : 3;
  return (
    <motion.div
      className={cn("pointer-events-none absolute", className)}
      style={{ width: size, height: size }}
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration: seconds, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
    >
      <Ui name={`profile/moving_circle${n}`} className="size-full" />
    </motion.div>
  );
}

/** Three up-arrows lighting in turn (profile/threearrow2–4). */
export function Chevrons({ className }: { className?: string }) {
  const [f, setF] = useState(2);
  useEffect(() => {
    const id = setInterval(() => setF((n) => (n === 4 ? 2 : n + 1)), 220);
    return () => clearInterval(id);
  }, []);
  return (
    <Ui name={`profile/threearrow${f}`} w={126} h={36} className={cn("absolute", className)} />
  );
}

export function PlayerSelectLabel({ className }: { className?: string }) {
  return (
    <Ui name="profile/playerselect" w={135} h={34} className={className} alt="PLAYER SELECT" />
  );
}

/** "PLEASE ENTER YOUR NAME" + field + "SELECT ?" (profile/namebox, 143 × 110) with a live input. */
export function NameBox({
  value,
  placeholder,
  onChange,
  label,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="relative h-[110px] w-[143px]">
      <Ui name="profile/namebox" w={143} h={110} className="absolute inset-0" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 12))}
        placeholder={placeholder}
        aria-label={label}
        className="absolute top-[36px] left-[10px] h-[20px] w-[123px] bg-transparent text-center font-bold text-[#23272f] text-[12px] outline-none placeholder:text-[#23272f]/55"
      />
    </div>
  );
}

/** The empty-slot card (profile/empty_character, 77 × 93), scaled to fit. */
export function NotAvailable({ className }: { className?: string }) {
  return (
    <Ui
      name="profile/empty_character"
      className={cn("h-[230px] w-[190px]", className)}
      alt="NOT AVAILABLE"
    />
  );
}

/** "Click here!!" with the mascot (profile/click_here, 149 × 80). */
export function ClickHere({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative h-[80px] w-[149px] hover:brightness-110"
    >
      <Ui name="profile/click_here" className="size-full" />
    </button>
  );
}

/** Speech bubble over a character (gameinterface/default/bubble1–3: left cap, stretch, right cap). */
export function SpeechBubble({ text }: { text: string }) {
  const b = (n: number) => `gameinterface/default/bubble${n}`;
  return (
    <div className="flex h-[42px] items-stretch">
      <Ui name={b(1)} w={23} h={42} />
      <div className="relative max-w-[260px]">
        <Ui name={b(2)} className="absolute inset-0 size-full" />
        <p className="relative truncate pt-[10px] font-bold text-[#222] text-[13px]">{text}</p>
      </div>
      <Ui name={b(3)} w={11} h={42} />
    </div>
  );
}

/** Dark panel for popups the client drew ad hoc (skill list): the status box's glass and rim. */
export function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[12px] border-[3px] border-[#a9afb7] bg-[#1e2a24]/90 shadow-[0_0_0_2px_#2e3238,0_20px_40px_rgb(0_0_0/0.5)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
