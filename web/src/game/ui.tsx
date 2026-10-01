import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { type CharacterRow, q } from "@/lib/api";
import { audio } from "./audio";
import { ASSETS } from "@/lib/assets";

/* ───────── roster: characters that have exported sprite data ───────── */

export type RosterEntry = CharacterRow & { key: string };

const spriteIndex = queryOptions({
  queryKey: ["game", "index"],
  queryFn: () =>
    fetch(`${ASSETS}/game/chars/index.json`).then(
      (r) => r.json() as Promise<{ key: string; id: number; name: string }[]>,
    ),
  staleTime: Number.POSITIVE_INFINITY,
});

export const rosterQueries = [spriteIndex, q.characters()] as const;

export function useRoster(): RosterEntry[] {
  const { data: index } = useSuspenseQuery(spriteIndex);
  const { data: chars } = useSuspenseQuery(q.characters());
  const byId = new Map(chars.map((c) => [c.id, c]));
  const rank = (c: CharacterRow) => (c.base_id !== null ? 1 : c.id < 100 ? 0 : 2);
  return index
    .map((s) => {
      const c = byId.get(s.id);
      return c && c.head ? { ...c, key: s.key } : null;
    })
    .filter((c): c is RosterEntry => c !== null)
    .sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}

/* ───────── "press any key": browsers need a gesture before audio ───────── */

export function StartGate({ onStart }: { onStart: () => void }) {
  // the title screen usually unlocked audio already; only ask when landing here directly
  const [open, setOpen] = useState(!audio.unlocked);
  useEffect(() => {
    if (!open) {
      onStart();
      return;
    }
    const go = (ev: Event) => {
      // the key that opens the gate isn't also a key for the screen behind it
      ev.stopImmediatePropagation();
      audio.unlock();
      audio.sfx("johnnyconfirm.wav");
      setOpen(false);
    };
    addEventListener("keydown", go, { once: true });
    addEventListener("pointerdown", go, { once: true });
    return () => {
      removeEventListener("keydown", go);
      removeEventListener("pointerdown", go);
    };
  }, [open, onStart]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid cursor-pointer place-items-center bg-black/80 backdrop-blur-sm"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
        >
          <motion.p
            className="font-lfo text-white text-xl tracking-[0.4em]"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
          >
            PRESS ANY KEY
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
