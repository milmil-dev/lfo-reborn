import { useLingui } from "@lingui/react/macro";
import { motion } from "motion/react";
import { useEffect, useEffectEvent, useMemo } from "react";
import { audio } from "@/game/audio";
import { type ChangeSection, parseChangelog, SECTION_ORDER } from "@/lib/changelog";
import { BUILD } from "@/lib/version";
import { MetalButton } from "./buttons";
import { DialogFrame } from "./frames";
import { Ui } from "./ui";

/*
  更新內容: every release's changes from CHANGELOG.md, newest first, in the game's dialogue box.
  Laid out in the 800 × 600 screen it is opened from.
*/

export const RELEASES = parseChangelog(__CHANGELOG__);
/** the newest release in the notes, for the title screen's "new" dot */
export const LATEST_RELEASE = RELEASES[0]?.version ?? null;

const order = (s: ChangeSection) => {
  const i = SECTION_ORDER.indexOf(s.kind);
  return i === -1 ? SECTION_ORDER.length : i;
};

export function ReleaseNotes({ onClose }: { onClose: () => void }) {
  const { t } = useLingui();
  const label: Record<string, string> = {
    Features: t`新功能`,
    "Bug Fixes": t`修正`,
    "Performance Improvements": t`效能改善`,
    Reverts: t`撤回`,
    "Code Refactoring": t`程式整理`,
    Documentation: t`文件`,
  };
  const releases = useMemo(
    () =>
      RELEASES.map((r) => ({
        ...r,
        sections: [...r.sections].sort((a, b) => order(a) - order(b)),
      })),
    [],
  );

  const close = useEffectEvent(() => {
    audio.sfx("johnnymove.wav", { volume: 0.5 });
    onClose();
  });
  useEffect(() => {
    // capture: the title menu underneath doesn't also take the key
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      close();
    };
    addEventListener("keydown", on, { capture: true });
    return () => removeEventListener("keydown", on, { capture: true });
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-20 grid place-items-center bg-black/55"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={close}
    >
      <motion.div
        role="dialog"
        aria-label={t`更新內容`}
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogFrame className="h-[470px] w-[600px]">
          <div className="relative flex h-full flex-col text-white">
            <header className="flex items-baseline justify-between pr-[22px]">
              <h2 className="font-bold text-[20px] tracking-[0.12em] [text-shadow:0_2px_0_#000]">
                {t`更新內容`}
              </h2>
              <span className="font-lfo text-[10px] text-white/50 tabular-nums">{BUILD}</span>
            </header>
            <button
              type="button"
              onClick={close}
              className="absolute top-0 -right-[6px] transition hover:brightness-125 active:scale-95"
              aria-label={t`關閉`}
            >
              <Ui name="gameinterface/default/closetablebutton" w={24} h={23} />
            </button>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 [scrollbar-color:#a9afb7_transparent] [scrollbar-width:thin]">
              {releases.length === 0 && (
                <p className="py-10 text-center text-sm text-white/60">{t`暫時未有更新紀錄。`}</p>
              )}
              {releases.map((r, i) => (
                <section key={r.version} className="mb-5">
                  <div className="sticky top-0 z-10 flex items-baseline gap-2 bg-[#0a0f16]/95 py-1">
                    <span className="font-lfo text-[#ffd447] text-[17px]">v{r.version}</span>
                    {r.date && (
                      <span className="font-lfo text-[10px] text-white/50 tabular-nums">
                        {r.date}
                      </span>
                    )}
                    {i === 0 && (
                      <span className="rounded-[3px] bg-[#e8343c] px-1.5 font-bold text-[10px] leading-[16px]">
                        {t`最新`}
                      </span>
                    )}
                  </div>
                  {r.sections.map((s) => (
                    <div key={s.kind} className="mt-2">
                      <h3 className="mb-1 font-bold text-[#9fd3ff] text-[13px]">
                        {label[s.kind] ?? s.kind}
                      </h3>
                      <ul className="flex flex-col gap-[3px]">
                        {s.items.map((it, j) => (
                          <li
                            key={`${it.commit ?? j}-${it.text}`}
                            className="flex items-baseline gap-2 text-[13px] leading-snug"
                          >
                            <span className="mt-[6px] size-[5px] shrink-0 self-start rounded-full bg-white/60" />
                            <span className="min-w-0">
                              {it.scope && (
                                <span className="mr-1.5 rounded-[3px] bg-white/12 px-1 font-lfo text-[9px] text-white/70 uppercase">
                                  {it.scope}
                                </span>
                              )}
                              {it.text}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </div>

            <div className="flex justify-center pt-2">
              <MetalButton onClick={close} className="h-[32px] w-[150px] text-[14px]">
                {t`關閉`}
              </MetalButton>
            </div>
          </div>
        </DialogFrame>
      </motion.div>
    </motion.div>
  );
}
