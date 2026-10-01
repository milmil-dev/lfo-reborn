import { useLingui } from "@lingui/react/macro";
import { motion } from "motion/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { audio } from "./audio";
import { MetalButton } from "./kit/buttons";
import { Ui } from "./kit/ui";
import { ControllerPanel, FIELD, PANEL, ROW_H, ROW_Y } from "./kit/controller";
import type { Button } from "./core/types";
import {
  BUTTONS,
  codeLabel,
  DEFAULT_BINDINGS,
  getBindings,
  keyCode,
  onBindings,
  type PadButton,
  setBindings,
} from "./input";

// geometry of the original panel (interface/controller, 724 × 499), traced in kit/controller
const ROW = ROW_Y;
const COL = FIELD;
const ROWS: Button[] = BUTTONS;
const PAD_BUTTONS: PadButton[] = ["attack", "jump", "defend"];
const PAD_NAME = [
  "A / ×",
  "B / ○",
  "X / □",
  "Y / △",
  "LB",
  "RB",
  "LT",
  "RT",
  "Back",
  "Start",
  "L3",
  "R3",
];

type Cell = { row: number; col: "key" | "pad" };

/** 按鍵設定: the original CONTROL SETTING panel, now actually rebinding keys and pad buttons. */
export function KeyConfig({ onClose }: { onClose: () => void }) {
  const { t } = useLingui();
  const bindings = useSyncExternalStore(onBindings, getBindings);
  const [sel, setSel] = useState<Cell>({ row: 4, col: "key" });
  const [listening, setListening] = useState<Cell | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () =>
      setScale(Math.min(1.35, (innerWidth - 32) / PANEL.w, (innerHeight - 150) / PANEL.h));
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);

  const editable = (c: Cell) => {
    const b = ROWS[c.row];
    // item / drop sit on the pad's shoulder buttons; only their keys can be changed
    if (b === "item" || b === "drop") return c.col === "key";
    return c.col === "key" || PAD_BUTTONS.includes(b as PadButton);
  };

  const assignKey = (b: Button, code: string) => {
    const keys = { ...bindings.keys };
    // a key drives one button only: take it away from whoever had it
    for (const other of BUTTONS) {
      const [p, s] = keys[other];
      if (other === b) continue;
      if (p === code) keys[other] = [s ?? "", undefined];
      else if (s === code) keys[other] = [p, undefined];
    }
    keys[b] = [code, undefined];
    setBindings({ ...bindings, keys });
  };

  const assignPad = (b: PadButton, index: number) => {
    const pad = { ...bindings.pad };
    for (const other of PAD_BUTTONS) if (pad[other] === index) pad[other] = bindings.pad[b];
    pad[b] = index;
    setBindings({ ...bindings, pad });
  };

  // waiting for a key
  useEffect(() => {
    if (!listening || listening.col !== "key") return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const code = keyCode(e);
      if (code && code !== "Escape") {
        assignKey(ROWS[listening.row] as Button, code);
        audio.sfx("johnnyconfirm.wav", { volume: 0.6 });
      }
      setListening(null);
    };
    addEventListener("keydown", onKey, { capture: true });
    return () => removeEventListener("keydown", onKey, { capture: true });
  });

  // waiting for a pad button
  useEffect(() => {
    if (!listening || listening.col !== "pad") return;
    let raf = 0;
    const was = new Set(
      (navigator.getGamepads?.()[0]?.buttons ?? []).flatMap((b, i) => (b.pressed ? [i] : [])),
    );
    const poll = () => {
      const pad = navigator.getGamepads?.()[0];
      const hit = pad?.buttons.findIndex((b, i) => b.pressed && !was.has(i) && i < 12);
      if (hit !== undefined && hit >= 0) {
        assignPad(ROWS[listening.row] as PadButton, hit);
        audio.sfx("johnnyconfirm.wav", { volume: 0.6 });
        setListening(null);
        return;
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    const onKey = (e: KeyboardEvent) => e.code === "Escape" && setListening(null);
    addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("keydown", onKey);
    };
  });

  // navigation
  useEffect(() => {
    if (listening) return;
    const onKey = (e: KeyboardEvent) => {
      const move = (row: number, col: Cell["col"]) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSel({ row: Math.max(0, Math.min(ROWS.length - 1, row)), col });
        audio.sfx("johnnymove.wav", { volume: 0.4 });
      };
      if (e.code === "ArrowUp") move(sel.row - 1, sel.col);
      else if (e.code === "ArrowDown") move(sel.row + 1, sel.col);
      else if (e.code === "ArrowLeft") move(sel.row, "key");
      else if (e.code === "ArrowRight") move(sel.row, "pad");
      else if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (editable(sel)) setListening(sel);
        else audio.sfx("guard.wav", { volume: 0.5 });
      } else if (e.code === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    addEventListener("keydown", onKey, { capture: true });
    return () => removeEventListener("keydown", onKey, { capture: true });
  });

  const label = (c: Cell) => {
    const b = ROWS[c.row];
    if ((b === "item" || b === "drop") && c.col === "pad")
      return b === "item" ? "LB / L1" : "RB / R1";
    if (c.col === "key") {
      const [p, s] = bindings.keys[b];
      return [p, s].filter(Boolean).map(codeLabel).join(" / ");
    }
    if (!PAD_BUTTONS.includes(b as PadButton)) return t`方向鍵`;
    return PAD_NAME[bindings.pad[b as PadButton]] ?? `#${bindings.pad[b as PadButton]}`;
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/75 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="flex flex-col items-center gap-5">
        <motion.div
          className="relative rounded-[28px] bg-[#23272f] shadow-[0_30px_80px_rgb(0_0_0/0.6)]"
          style={{ width: PANEL.w * scale, height: PANEL.h * scale }}
          initial={{ scale: 0.92, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ width: PANEL.w, height: PANEL.h, transform: `scale(${scale})` }}
          >
            <ControllerPanel />
            {ROWS.map((_, row) =>
              (["key", "pad"] as const).map((col) => {
                const c = { row, col };
                const on = sel.row === row && sel.col === col;
                const wait = listening?.row === row && listening.col === col;
                return (
                  <button
                    key={`${row}-${col}`}
                    type="button"
                    disabled={!editable(c)}
                    onMouseEnter={() => setSel(c)}
                    onClick={() => editable(c) && setListening(c)}
                    className={cn(
                      // the field pills are part of the traced panel art; only the states paint over them
                      "absolute flex items-center justify-center rounded-full font-bold text-[13px] tracking-wide transition-colors",
                      editable(c) ? "text-[#23272f]" : "text-white/45",
                      on && editable(c) && "bg-[#ffd447] ring-2 ring-white",
                      wait && "animate-pulse bg-[#e8343c] text-white",
                    )}
                    style={{ left: COL[col].x, width: COL[col].w, top: ROW(row), height: ROW_H }}
                  >
                    {wait ? (col === "key" ? t`按下新按鍵…` : t`按手掣按鈕…`) : label(c)}
                  </button>
                );
              }),
            )}
          </div>
        </motion.div>
        <div className="flex items-center justify-center gap-3">
          <MetalButton
            onClick={() => {
              setBindings(structuredClone(DEFAULT_BINDINGS));
              audio.sfx("johnnymove.wav", { volume: 0.5 });
            }}
          >
            {t`預設值`}
          </MetalButton>
          <button
            type="button"
            onClick={onClose}
            aria-label={t`確定`}
            className="hover:brightness-110"
          >
            <Ui name="interface/gamemenu10" w={182} h={38} />
          </button>
        </div>
        <p className="text-foreground/50 text-xs">{t`方向鍵選擇 · Enter 更改 · Esc 返回`}</p>
      </div>
    </motion.div>
  );
}
