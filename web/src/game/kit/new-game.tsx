import { useLingui } from "@lingui/react/macro";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useState } from "react";
import { audio } from "@/game/audio";
import { Screen } from "@/game/screen";
import { cn } from "@/lib/cn";
import { Ui } from "./ui";

/*
  開設遊戲室 — the client's new-game screen (newgame/): the arena (backg1, 800 × 600) with the
  guide girl standing in the bottom-right corner, and the room-name box (interface/gamemenu3)
  with 確定 / 取消 (gamemenu4 / 5).

  The girl is drawn as LFO.exe does it (0x5cc767): girl1 at (800 − w, 600 − h); girl_eye2 always
  at (592, 240); at (627, 237) girl_eye3 (open) and girl_eye1 (closed) swap every 1000–1499 ms —
  a wink; at (620, 294) girl_mouth1 and girl_mouth2 swap every 200–699 ms while she talks.
*/

const between = (min: number, span: number) => min + Math.floor(Math.random() * span);

/** Flips between true and false, holding each state for min … min + span ms. */
function useFlip(min: number, span: number, on: boolean) {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!on) return;
    let t = 0;
    const tick = () => {
      setV((x) => !x);
      t = window.setTimeout(tick, between(min, span));
    };
    t = window.setTimeout(tick, between(min, span));
    return () => clearTimeout(t);
  }, [min, span, on]);
  return v;
}

export function GuideGirl({ talking = true }: { talking?: boolean }) {
  const still = useReducedMotion() ?? false;
  const open = !useFlip(1000, 500, !still);
  const mouth = useFlip(200, 500, talking && !still);
  return (
    <motion.div
      className="pointer-events-none absolute top-[108px] left-[423px] h-[492px] w-[377px]"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <Ui name="newgame/girl1" w={377} h={492} className="absolute inset-0" />
      <Ui name="newgame/girl_eye2" w={23} h={44} className="absolute top-[132px] left-[169px]" />
      {open ? (
        <Ui name="newgame/girl_eye3" w={40} h={44} className="absolute top-[129px] left-[204px]" />
      ) : (
        <Ui name="newgame/girl_eye1" w={39} h={40} className="absolute top-[129px] left-[204px]" />
      )}
      {mouth ? (
        <Ui
          name="newgame/girl_mouth2"
          w={23}
          h={17}
          className="absolute top-[186px] left-[197px]"
        />
      ) : (
        <Ui
          name="newgame/girl_mouth1"
          w={18}
          h={10}
          className="absolute top-[186px] left-[197px]"
        />
      )}
    </motion.div>
  );
}

/** 開設遊戲室: name the room, then 確定 starts the stage (取消 goes back to the list). */
export function NewGameRoom({
  stage,
  defaultName,
  onConfirm,
  onCancel,
}: {
  /** what is about to be played, shown above the box */
  stage: string;
  defaultName: string;
  onConfirm: (room: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const [room, setRoom] = useState(defaultName);
  const [focus, setFocus] = useState<"yes" | "no">("yes");
  const ok = () => {
    audio.sfx("johnnyconfirm.wav");
    onConfirm(room.trim() || defaultName);
  };
  const no = () => {
    audio.sfx("johnnymove.wav", { volume: 0.6 });
    onCancel();
  };
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Enter" || (e.code === "KeyJ" && !(e.target instanceof HTMLInputElement)))
      (focus === "yes" ? ok : no)();
    else if (e.key === "Escape") no();
    else if (e.key === "ArrowDown" || e.key === "ArrowUp")
      setFocus((f) => (f === "yes" ? "no" : "yes"));
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  });
  useEffect(() => {
    // capture: the list underneath doesn't also take the key
    const h = (e: KeyboardEvent) => onKey(e);
    addEventListener("keydown", h, { capture: true });
    return () => removeEventListener("keydown", h, { capture: true });
  }, []);

  const button = (which: "yes" | "no", top: number) => (
    <button
      type="button"
      onMouseEnter={() => setFocus(which)}
      onClick={which === "yes" ? ok : no}
      className={cn(
        "absolute left-[70px] h-[38px] w-[182px] transition",
        focus === which ? "brightness-125 drop-shadow-[0_0_6px_#ffd27a]" : "brightness-90",
      )}
      style={{ top }}
      aria-label={which === "yes" ? t`確定` : t`取消`}
    >
      <Ui name={which === "yes" ? "interface/gamemenu4" : "interface/gamemenu5"} w={182} h={38} />
    </button>
  );

  return (
    <motion.div
      className="fixed inset-0 z-40 bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Screen>
        <Ui name="newgame/backg1" w={800} h={600} className="absolute inset-0" />
        <GuideGirl />
        <div className="absolute top-[168px] left-[60px] w-[320px]">
          <p className="font-black text-[26px] text-white italic [text-shadow:0_2px_0_#000,0_0_14px_rgb(0_0_0/0.6)]">
            {t`開設遊戲室`}
          </p>
          <p className="mt-1 truncate font-bold text-[14px] text-[#ffe08a] [text-shadow:0_1px_2px_#000]">
            {stage}
          </p>
        </div>
        <div className="absolute top-[250px] left-[70px] h-[38px] w-[182px]">
          <Ui name="interface/gamemenu3" w={182} h={38} className="absolute inset-0" />
          <input
            autoFocus
            value={room}
            onChange={(e) => setRoom(e.target.value.slice(0, 16))}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t`遊戲室名稱`}
            className="absolute top-[9px] left-[10px] h-[20px] w-[162px] bg-transparent font-bold text-[#23272f] text-[13px] outline-none"
          />
        </div>
        {button("yes", 300)}
        {button("no", 346)}
      </Screen>
    </motion.div>
  );
}
