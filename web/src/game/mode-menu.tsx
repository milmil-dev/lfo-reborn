import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { audio } from "./audio";
import { Ui } from "./kit/ui";

// the original mode menu (interface/gamemenu1): five stacked buttons in one piece of art
export type Mode = "story" | "vs" | "mission" | "champion" | "exit" | "cancel";
const ROWS: { id: Mode; label: string }[] = [
  { id: "story", label: "開始 STORY 模式" },
  { id: "vs", label: "開始 VS 模式" },
  { id: "mission", label: "開始 MISSION 模式" },
  { id: "exit", label: "離開 LFO" },
  { id: "cancel", label: "取消" },
  // 王者爭霸 was a scheduled event online, never a row of this menu: it hangs below the art
  { id: "champion", label: "LFO 皇者爭霸戰" },
];

/** The game-mode menu, opened from the lobby's FIGHT button. */
export function ModeMenu({ onPick }: { onPick: (m: Mode) => void }) {
  const [sel, setSel] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopImmediatePropagation();
        audio.sfx("johnnymove.wav", { volume: 0.6 });
        setSel((s) => (s + (e.key === "ArrowDown" ? 1 : ROWS.length - 1)) % ROWS.length);
      } else if (e.key === "Enter" || e.code === "KeyJ") {
        e.stopImmediatePropagation();
        audio.sfx("johnnyconfirm.wav");
        onPick(ROWS[sel].id);
      } else if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onPick("cancel");
      }
    };
    addEventListener("keydown", onKey, { capture: true });
    return () => removeEventListener("keydown", onKey, { capture: true });
  }, [sel, onPick]);

  return (
    <motion.div
      className="absolute inset-0 z-40 bg-black/50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => onPick("cancel")}
    >
      <motion.div
        className="absolute top-[197px] left-[304px] h-[206px] w-[192px]"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
      >
        <Ui name="interface/gamemenu1" w={192} h={206} />
        {ROWS.slice(0, 5).map((r, i) => (
          <button
            key={r.id}
            type="button"
            aria-label={r.label}
            onMouseEnter={() => setSel(i)}
            onClick={() => {
              audio.sfx("johnnyconfirm.wav");
              onPick(r.id);
            }}
            className={cn(
              "absolute left-[5px] w-[182px] rounded-[5px] transition",
              sel === i && "bg-[#ffd447]/30 shadow-[0_0_10px_#ffd447] ring-2 ring-[#ffd447]",
            )}
            style={{ top: i * 41.2 + 3, height: 35 }}
          />
        ))}
        <button
          type="button"
          onMouseEnter={() => setSel(5)}
          onClick={() => {
            audio.sfx("johnnyconfirm.wav");
            onPick("champion");
          }}
          className={cn(
            "absolute top-[214px] left-[5px] h-[34px] w-[182px] rounded-[6px] border-2 border-[#c99a2e] bg-[linear-gradient(#5a1a12,#2a0a08)] font-bold text-[13px] text-[#ffd27a] transition",
            sel === 5 && "shadow-[0_0_10px_#ffd447] ring-2 ring-[#ffd447]",
          )}
        >
          LFO 皇者爭霸戰
        </button>
      </motion.div>
    </motion.div>
  );
}
