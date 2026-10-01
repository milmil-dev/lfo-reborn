import { useLingui } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpenIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { audio } from "@/game/audio";
import { KeyConfig } from "@/game/key-config";
import { PrologueLines } from "@/game/kit/art";
import { GlossButton } from "@/game/kit/buttons";
import { Screen } from "@/game/screen";
import { MUSEUM_URL } from "@/lib/links";
import { useActiveProfile } from "@/game/profiles";
import { ASSETS } from "@/lib/assets";
import { BUILD } from "@/lib/version";

export const Route = createFileRoute("/")({ component: TitleScreen });

const UI = `${ASSETS}/ui-hd`;

// the original intro: five heads fly in, each with a line of the prologue
// (music: the title menu's lfo_theme2, LFO.exe scene 7 — the client never plays lfo_theme)
const INTRO = [1, 2, 3, 4, 5].map((n) => ({
  head: `${UI}/intro/introflyhead${n}.webp`,
  from: n % 2 ? 1 : -1,
}));
const INTRO_MS = 2600;

// the title's three buttons (intromenupack3b1–3): 開始遊戲 → servers, 控制設定, 帳戶管理 → profiles
type Main = "continue" | "start" | "keys" | "profile";
const MAIN_LABEL: Record<Main, string> = {
  continue: "繼續遊戲",
  start: "開始遊戲",
  keys: "控制設定",
  profile: "帳戶管理",
};

let entered = false; // intro plays once per visit

type Phase = "gate" | "intro" | "title" | "keys" | "leaving";

const WITH_CONTINUE: Main[] = ["continue", "start", "keys", "profile"];
const FIRST_TIME: Main[] = ["start", "keys", "profile"];

function TitleScreen() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>(entered ? "title" : "gate");
  const [shot, setShot] = useState(0); // intro shot
  // a returning player gets 繼續遊戲 (straight to the lobby with the last profile) above the originals
  const hasProfile = useActiveProfile() !== null;
  const main = hasProfile ? WITH_CONTINUE : FIRST_TIME;
  const [sel, setSel] = useState(0);
  const [muted, setMuted] = useState(audio.muted);
  const [flash, setFlash] = useState(0);

  const toTitle = useCallback(() => {
    entered = true;
    setFlash((f) => f + 1);
    setPhase("title");
  }, []);

  const go = useCallback(
    (to: string) => {
      audio.sfx("johnnyconfirm.wav");
      setFlash((f) => f + 1);
      setPhase("leaving");
      setTimeout(() => void navigate({ to }), 450);
    },
    [navigate],
  );

  const pickMain = useCallback(
    (i: number) => {
      const m = main[i];
      if (m === "continue") return go("/play/lobby");
      audio.sfx("johnnyconfirm.wav");
      if (m === "start") go("/play/server");
      else if (m === "keys") setPhase("keys");
      else go("/play/profile");
    },
    [go, main],
  );

  useEffect(() => {
    if (entered) audio.music("lfo_theme2.ogg", 0.4);
  }, []);

  // intro timeline
  useEffect(() => {
    if (phase !== "intro") return;
    const id = setTimeout(
      () => (shot + 1 < INTRO.length ? setShot(shot + 1) : toTitle()),
      INTRO_MS,
    );
    return () => clearTimeout(id);
  }, [phase, shot, toTitle]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || phase === "keys") return;
      const move = (fn: () => void) => {
        e.preventDefault();
        audio.sfx("johnnymove.wav", { volume: 0.6 });
        fn();
      };
      if (phase === "gate") {
        audio.unlock();
        audio.music("lfo_theme2.ogg", 0.4);
        setPhase("intro");
      } else if (phase === "intro") toTitle();
      else if (phase === "title") {
        if (e.key === "ArrowDown") move(() => setSel((s) => (s + 1) % main.length));
        else if (e.key === "ArrowUp")
          move(() => setSel((s) => (s - 1 + main.length) % main.length));
        else if (e.key === "Enter" || e.code === "KeyJ") pickMain(sel);
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [phase, sel, pickMain, toTitle, main.length]);

  const onPointer = () => {
    if (phase === "gate") {
      audio.unlock();
      audio.music("lfo_theme2.ogg", 0.4);
      setPhase("intro");
    } else if (phase === "intro") toTitle();
  };

  const showTitle = phase === "title" || phase === "keys" || phase === "leaving";

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black text-foreground select-none"
      onPointerDown={onPointer}
    >
      {/* fill the letterbox with a soft, blurred copy of the art */}
      {showTitle && (
        <img
          src={`${UI}/intro/open3.webp`}
          srcSet={`${UI}/intro/open3.webp 4x`}
          alt=""
          className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl"
        />
      )}

      {/* the build: release version and the commit CI built it from */}
      <p className="pointer-events-none absolute right-3 bottom-2 z-10 font-lfo text-[10px] text-white/40 tabular-nums">
        {BUILD}
      </p>

      <Screen>
        {/* ── press any key ── */}
        <AnimatePresence>
          {phase === "gate" && (
            <motion.div
              key="gate"
              className="absolute inset-0 grid place-items-center"
              exit={{ opacity: 0 }}
            >
              <img
                src={`${UI}/intro/3dlogo.webp`}
                srcSet={`${UI}/intro/3dlogo.webp 4x`}
                alt="LFO"
                className="absolute top-[150px] left-[47px] w-[706px]"
              />
              <motion.p
                className="absolute top-[420px] w-full text-center font-bold text-lg text-white tracking-[0.4em]"
                animate={{ opacity: [1, 0.15, 1] }}
                transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY }}
              >
                PRESS ANY KEY
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── intro ── */}
        {phase === "intro" && (
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_40%,#3a0d1c,#000_75%)]">
            <AnimatePresence mode="popLayout">
              <motion.img
                key={`h${shot}`}
                src={INTRO[shot].head}
                alt=""
                className="absolute top-[20px] left-1/2 max-h-[400px] -translate-x-1/2 drop-shadow-[0_20px_40px_rgb(0_0_0/0.8)]"
                initial={{
                  opacity: 0,
                  x: INTRO[shot].from * 420,
                  scale: 1.4,
                  rotate: INTRO[shot].from * 8,
                }}
                animate={{ opacity: 1, x: 0, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)" }}
                transition={{ type: "spring", stiffness: 140, damping: 18 }}
              />
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div
                key={`t${shot}`}
                className="absolute top-[395px] left-[7px]"
                exit={{ opacity: 0, transition: { duration: 0.3 } }}
              >
                <PrologueLines shot={shot} />
              </motion.div>
            </AnimatePresence>
            <p className="absolute right-4 bottom-3 text-white/40 text-xs">{t`按任意鍵略過`}</p>
          </div>
        )}

        {/* ── title ── */}
        {showTitle && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* the art's top 26 px carry the publisher's copyright line over plain sky:
                zoom from the bottom edge so that strip falls outside the screen */}
            <img
              src={`${UI}/intro/open3.webp`}
              srcSet={`${UI}/intro/open3.webp 4x`}
              alt=""
              className="absolute inset-0 origin-bottom scale-[1.046]"
              draggable={false}
            />
            <div className="absolute bottom-[40px] left-[640px] flex flex-col gap-[6px]">
              {main.map((m, i) => (
                <motion.div
                  key={m}
                  className="relative"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: sel === i && phase === "title" ? -8 : 0 }}
                  transition={{
                    delay: 0.4 + i * 0.08,
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }}
                >
                  <GlossButton
                    skin={
                      m === "continue" ? undefined : ({ start: 1, keys: 2, profile: 3 } as const)[m]
                    }
                    active={sel === i && phase === "title"}
                    onMouseEnter={() => {
                      if (sel !== i) audio.sfx("johnnymove.wav", { volume: 0.4 });
                      setSel(i);
                    }}
                    onClick={() => phase === "title" && pickMain(i)}
                  >
                    {MAIN_LABEL[m]}
                  </GlossButton>
                  {sel === i && phase === "title" && (
                    <motion.span
                      layoutId="title-cursor"
                      className="absolute top-1/2 -left-5 size-0 -translate-y-1/2 border-y-[7px] border-y-transparent border-l-[10px] border-l-[#ffd447]"
                    />
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* white flash on every confirm */}
        <AnimatePresence>
          {flash > 0 && (
            <motion.div
              key={flash}
              className="pointer-events-none absolute inset-0 bg-white"
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
          )}
        </AnimatePresence>
      </Screen>

      <AnimatePresence>
        {phase === "keys" && <KeyConfig onClose={() => setPhase("title")} />}
      </AnimatePresence>

      {showTitle && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-4 text-white/60 text-xs">
          <a
            href={MUSEUM_URL}
            target="_blank"
            rel="noopener"
            className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur hover:text-white"
          >
            <BookOpenIcon className="size-3.5" />
            {t`圖鑑館`}
          </a>
          <button
            type="button"
            onClick={() => setMuted(audio.toggleMute())}
            className="grid size-8 place-items-center rounded-full bg-black/50 backdrop-blur hover:text-white"
            aria-label={muted ? t`開啟聲音` : t`靜音`}
          >
            {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
          </button>
        </div>
      )}
    </div>
  );
}
