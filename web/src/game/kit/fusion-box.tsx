import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { audio } from "@/game/audio";
import {
  canFuse,
  FAILED,
  FUSION_DAYS,
  FUSION_FEE,
  fusionByKey,
  fuse,
  isFusion,
} from "@/game/fusion";
import { useItemTable } from "@/game/items-data";
import {
  endFusion,
  fusionOf,
  nianyuanIn,
  startFusion,
  useActiveProfile,
  useInventory,
  useMoney,
  useOwnedChars,
  useSlots,
} from "@/game/profiles";
import { useRoster } from "@/game/ui";
import { asset } from "@/lib/api";
import { ASSETS } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { MetalButton } from "./buttons";
import { DialogFrame } from "./frames";

/*
  毛毛高's 合體 window (he-ti.mdx 合體方法及流程): the six 念源體 held, the 闇 念源體's term,
  the fee, and the account's other characters to fuse with; after a fusion, what came out. A
  合體戰神 sees its term and can split (分體) — the 解源體 was the web shop's, so 毛毛高 does it.
*/

const head = (key: string) => `${ASSETS}/ui-hd/profile/${key}_head.webp`;

export function FusionBox({
  onClose,
  onRelog,
}: {
  onClose: () => void;
  /** a fusion or a split takes effect on the next login (he-ti.mdx 6): back to the profiles */
  onRelog: () => void;
}) {
  const { t } = useLingui();
  const profile = useActiveProfile();
  const slots = useSlots();
  const owned = useOwnedChars();
  const inv = useInventory();
  const money = useMoney();
  const items = useItemTable();
  const roster = useRoster();
  const nameOf = (key: string) => roster.find((r) => r.key === key)?.name ?? key;

  // 「可建立使用的角色」: the account's characters (its slots and the cards in 儲物室), not this one
  const partners = useMemo(() => {
    const keys = new Set<string>();
    for (const p of slots) if (p) keys.add(p.key);
    for (const k of owned) keys.add(k);
    return [...keys].filter((k) => profile && canFuse(profile.key, k) && !isFusion(k));
  }, [slots, owned, profile]);

  const [partner, setPartner] = useState<string | null>(null);
  const [days, setDays] = useState<number>(FUSION_DAYS[0]);
  const [result, setResult] = useState<{ key: string; line: string } | null>(null);
  const [line, setLine] = useState<string | null>(null);

  const close = useEffectEvent(() => {
    audio.sfx("johnnymove.wav", { volume: 0.5 });
    onClose();
  });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      close();
    };
    addEventListener("keydown", on, { capture: true });
    return () => removeEventListener("keydown", on, { capture: true });
  }, []);

  if (!profile) return null;
  const fused = fusionOf(profile);
  const held = nianyuanIn(inv);
  const ready = held.every((n) => n.row) && money >= FUSION_FEE && !!partner;

  const confirm = () => {
    if (!partner) return;
    const into = fuse(profile.key, partner, Math.random());
    const r = startFusion(into, days);
    setLine(r.line);
    if (!r.ok) return audio.sfx("guard.wav", { volume: 0.6 });
    audio.sfx("johnnyallright.wav");
    setResult({
      key: into,
      line:
        into === FAILED
          ? t`合體失敗……角色異變成了合體戰神「${fusionByKey(into)!.name}」！`
          : t`合體成功！你成為了合體戰神「${fusionByKey(into)!.name}」。`,
    });
  };

  return (
    <motion.div
      className="absolute inset-0 z-20 grid place-items-center bg-black/55"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
    >
      <motion.div
        role="dialog"
        aria-label={t`合體`}
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogFrame className="h-[470px] w-[620px]">
          <div className="flex h-full flex-col text-white">
            <h2 className="font-bold text-[18px] tracking-[0.1em] [text-shadow:0_2px_0_#000]">
              {t`毛毛高：合體`}
            </h2>

            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  key="result"
                  className="flex flex-1 flex-col items-center justify-center gap-3"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <motion.img
                    src={head(result.key)}
                    alt=""
                    className="h-[220px] drop-shadow-[0_0_24px_rgb(255_212_71/0.6)]"
                    initial={{ filter: "brightness(4)" }}
                    animate={{ filter: "brightness(1)" }}
                    transition={{ duration: 1.2 }}
                  />
                  <p className="text-center font-bold text-[16px] text-[#ffd447]">{result.line}</p>
                  <p className="text-[12px] text-white/60">{t`合體期 ${days} 天`}</p>
                  <MetalButton onClick={onRelog} className="h-[32px] w-[150px] text-[14px]">
                    {t`確定`}
                  </MetalButton>
                </motion.div>
              ) : fused ? (
                <motion.div
                  key="fused"
                  className="flex flex-1 flex-col items-center justify-center gap-3"
                >
                  <img src={head(fused.key)} alt="" className="h-[200px]" />
                  <p className="font-bold text-[16px]">
                    {t`你現在是合體戰神「${fusionByKey(fused.key)?.name ?? ""}」。`}
                  </p>
                  <p className="text-[13px] text-white/70">
                    {t`餘下 ${Math.max(1, Math.ceil((fused.until - Date.now()) / 86_400_000))} 天`}
                  </p>
                  <div className="flex gap-3">
                    <MetalButton
                      onClick={() => {
                        endFusion();
                        audio.sfx("johnnyconfirm.wav");
                        onRelog();
                      }}
                      className="h-[32px] w-[150px] text-[14px]"
                    >
                      {t`分體`}
                    </MetalButton>
                    <MetalButton onClick={close} className="h-[32px] w-[150px] text-[14px]">
                      {t`離開`}
                    </MetalButton>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="pick" className="mt-2 flex min-h-0 flex-1 flex-col gap-3">
                  {/* the seven 念源體: six from the field, 闇 chosen here */}
                  <div className="flex items-center gap-2">
                    {held.map((n) => {
                      const icon = items.get(n.id)?.icon;
                      return (
                        <span
                          key={n.id}
                          className={cn(
                            "relative grid size-[40px] place-items-center rounded-[6px] bg-black/50 ring-1",
                            n.row ? "ring-[#7fe3ff]" : "opacity-40 ring-white/20",
                          )}
                          title={`${n.name}．念源體`}
                        >
                          {icon ? (
                            <img src={asset(icon)} alt="" className="max-h-[32px] max-w-[32px]" />
                          ) : (
                            <span className="font-bold text-[14px]">{n.name}</span>
                          )}
                          <span className="absolute -bottom-[2px] -right-[2px] rounded-[3px] bg-black/80 px-[2px] text-[9px]">
                            {n.name}
                          </span>
                        </span>
                      );
                    })}
                    <span className="mx-1 text-white/50">+</span>
                    <span className="text-[13px]">{t`闇`}</span>
                    {FUSION_DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDays(d)}
                        className={cn(
                          "rounded-[4px] px-2 py-1 font-bold text-[12px] ring-1",
                          d === days ? "bg-[#ffd447] text-black ring-[#ffd447]" : "ring-white/30",
                        )}
                      >
                        {t`${d}天`}
                      </button>
                    ))}
                  </div>

                  <p className="text-[12px] text-white/70">
                    {t`選擇與「${nameOf(profile.key)}」合體的角色：`}
                  </p>
                  <div className="grid min-h-0 flex-1 grid-cols-6 content-start gap-2 overflow-y-auto pr-1">
                    {partners.length === 0 && (
                      <p className="col-span-6 py-6 text-center text-[13px] text-white/60">
                        {t`帳號內要有多於一個角色才可以合體。`}
                      </p>
                    )}
                    {partners.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPartner(k)}
                        className={cn(
                          "flex flex-col items-center rounded-[6px] bg-black/40 p-1 ring-1 transition",
                          partner === k
                            ? "ring-2 ring-[#ffd447]"
                            : "ring-white/15 hover:ring-white/40",
                        )}
                      >
                        <img src={head(k)} alt="" className="h-[72px]" />
                        <span className="truncate text-[11px]">{nameOf(k)}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={cn("text-[13px]", money < FUSION_FEE && "text-[#ff9b9b]")}>
                      {t`手續費 ＄${FUSION_FEE.toLocaleString()}`}
                    </span>
                    {line && <span className="text-[12px] text-[#ff9b9b]">{line}</span>}
                    <div className="flex gap-3">
                      <MetalButton
                        onClick={confirm}
                        disabled={!ready}
                        className="h-[32px] w-[120px] text-[14px]"
                      >
                        {t`合體`}
                      </MetalButton>
                      <MetalButton onClick={close} className="h-[32px] w-[120px] text-[14px]">
                        {t`離開`}
                      </MetalButton>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogFrame>
      </motion.div>
    </motion.div>
  );
}
