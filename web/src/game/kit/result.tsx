import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { audio } from "../audio";
import { Ui } from "./ui";

/*
  The client's result board (gameresult/summarytable, 784 × 394, 11-column table) with its blue
  buttons (summarybut0 normal / 2 hover), under a heading lettered like interface/letsfight.
*/

// column boundaries of the table art, measured from summarytable
const COLS = [18, 113, 165, 220, 294, 371, 445, 516, 563, 610, 685, 760];
const ROW = (i: number) => 78 + i * 21;

export type ResultRow = (string | number)[];

/** Red chrome lettering in the style of the original LET'S FIGHT !! banner. */
export function ChromeTitle({ children, className }: { children: string; className?: string }) {
  return (
    <p
      className={cn(
        "bg-[linear-gradient(#ffd1c9_0%,#ff3b30_38%,#9c0f16_62%,#ff6b5c_100%)] bg-clip-text font-lfo text-transparent italic [-webkit-text-stroke:2px_#f5c542] [filter:drop-shadow(0_3px_0_#5a0a0e)_drop-shadow(0_0_12px_rgb(255_59_48/0.5))]",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function ResultBoard({
  heading,
  title,
  header,
  rows,
  actions,
}: {
  heading: string;
  title: string;
  header: string[];
  rows: ResultRow[];
  actions: { label: string; run: () => void }[];
}) {
  const [sel, setSel] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        setSel((s) => (s + (e.key === "ArrowRight" ? 1 : actions.length - 1)) % actions.length);
        audio.sfx("johnnymove.wav", { volume: 0.5 });
      } else if (e.key === "Enter" || e.code === "KeyJ") {
        audio.sfx("johnnyconfirm.wav");
        actions[sel].run();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [actions, sel]);

  const cell = (text: string | number, c: number, r: number, head?: boolean) => (
    <span
      key={`${r}-${c}`}
      className={cn(
        "absolute flex items-center justify-center truncate text-[12px] tabular-nums",
        head
          ? "font-bold text-[#23272f]"
          : "font-bold text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.6)]",
      )}
      style={{ left: COLS[c] + 2, width: COLS[c + 1] - COLS[c] - 4, top: ROW(r), height: 20 }}
    >
      {text}
    </span>
  );

  return (
    <motion.div
      className="absolute inset-0 grid place-items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative h-[520px] w-[784px]">
        <motion.div
          className="absolute inset-x-0 top-0 flex justify-center"
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
        >
          <ChromeTitle className="text-[84px] leading-none">{heading}</ChromeTitle>
        </motion.div>
        <motion.div
          className="absolute top-[110px] left-0 h-[394px] w-[784px]"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <Ui name="gameresult/summarytable" w={784} h={394} className="absolute inset-0" />
          <p className="absolute top-[12px] left-[16px] font-bold text-[15px] text-white">
            {title}
          </p>
          {header.map((h, c) => cell(h, c, 0, true))}
          {rows.map((row, r) => row.map((v, c) => cell(v, c, r + 1)))}
          <div className="absolute bottom-[26px] left-0 flex w-full justify-center gap-[20px]">
            {actions.map((a, i) => (
              <button
                key={a.label}
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => {
                  audio.sfx("johnnyconfirm.wav");
                  a.run();
                }}
                className="relative grid h-[37px] w-[149px] place-items-center"
              >
                <Ui
                  name={`gameresult/summarybut${sel === i ? 2 : 0}`}
                  w={149}
                  h={37}
                  className="absolute inset-0"
                />
                <span className="relative font-bold text-[15px] text-white [text-shadow:0_1px_1px_#0a2a6a]">
                  {a.label}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
