import { useLingui } from "@lingui/react/macro";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { asset, type Stats } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmt, parseKeys, STAT_CAP, STAT_KEYS } from "@/lib/lfo";

export function useStatLabels(): Record<keyof Stats, string> {
  const { t } = useLingui();
  return { hp: "HP", mp: "MP", sp: "SP", str: t`力量`, def: t`防禦`, agi: t`敏捷` };
}

export function Logo({ className }: { className?: string }) {
  return (
    <img
      src={asset("dex/logo/lfo-hk.png")}
      alt="LFO 小朋友齊打交 Online"
      className={cn("h-auto select-none", className)}
      draggable={false}
    />
  );
}

/** Game art with a tinted initial as fallback — never grey placeholder art. */
export function Art({
  src,
  name,
  className,
  style,
  imgClassName,
  eager,
}: {
  src: string | null | undefined;
  name: string;
  className?: string;
  style?: CSSProperties;
  imgClassName?: string;
  eager?: boolean;
}) {
  return (
    <div className={cn("grid place-items-center", className)} style={style}>
      {src ? (
        <img
          src={asset(src)}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          className={cn("max-h-full max-w-full object-contain select-none", imgClassName)}
        />
      ) : (
        <span className="font-black text-5xl text-foreground/20">{name.slice(0, 1)}</span>
      )}
    </div>
  );
}

export function KeyCaps({ keys, className }: { keys: string[]; className?: string }) {
  const { t } = useLingui();
  if (!keys.length) return null;
  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-1.5", className)}
      aria-label={t`出招：${keys.join(" / ")}`}
    >
      {keys.map((seq, i) => (
        <span key={seq} className="inline-flex items-center gap-1">
          {i > 0 && <span className="px-1 text-muted-foreground text-xs">{t`或`}</span>}
          {parseKeys(seq).map((k, j) => (
            <kbd
              key={`${seq}${j}`}
              className={cn(
                "inline-grid h-6 min-w-6 place-items-center rounded-md px-1.5 font-bold text-xs",
                k.kind === "action"
                  ? "bg-foreground text-background"
                  : "bg-surface-2 text-foreground ring-1 ring-foreground/15",
              )}
            >
              {k.label}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}

export function Tier({ n }: { n: number }) {
  const { t } = useLingui();
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={t`等級 ${n}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rotate-45 rounded-[1px]",
            i <= n ? "bg-highlight" : "bg-foreground/15",
          )}
        />
      ))}
    </span>
  );
}

export function ModChips({ mods, className }: { mods: Stats; className?: string }) {
  const labels = useStatLabels();
  const entries = STAT_KEYS.filter((k) => mods[k]);
  if (!entries.length) return null;
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {entries.map((k) => (
        <span
          key={k}
          className={cn(
            "rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
            mods[k] > 0 ? "bg-up/10 text-up" : "bg-down/10 text-down",
          )}
        >
          {labels[k]} {mods[k] > 0 ? "+" : ""}
          {mods[k]}
        </span>
      ))}
    </span>
  );
}

/** Flat bars: solid = starting value, faint track = cap for this character. */
export function StatBars({ start, max }: { start: Stats; max: Stats }) {
  const labels = useStatLabels();
  return (
    <dl className="grid gap-3">
      {STAT_KEYS.map((k, i) => (
        <div key={k} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-4">
          <dt className="text-muted-foreground text-sm">{labels[k]}</dt>
          <div className="relative h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-foreground/10"
              style={{ width: `${Math.min(100, (max[k] / STAT_CAP[k]) * 100)}%` }}
            />
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                background: "color-mix(in oklab, var(--entity, var(--primary)) 70%, white)",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (start[k] / STAT_CAP[k]) * 100)}%` }}
              transition={{ duration: 0.8, delay: 0.05 * i, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <dd className="font-mono text-sm tabular-nums">
            {fmt(start[k])}
            <span className="text-muted-foreground"> / {fmt(max[k])}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex animate-rise flex-wrap items-end justify-between gap-6 pt-10 pb-12">
      <h1 className="font-black text-[clamp(3.2rem,8vw,7.5rem)] leading-[0.95] tracking-[-0.04em]">
        {title}
      </h1>
      {children}
    </header>
  );
}
