import { useLingui } from "@lingui/react/macro";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { audio } from "@/game/audio";
import { ServerBar } from "@/game/hd";
import { IconButton, TextPill } from "@/game/kit/buttons";
import { getServer, setServer } from "@/game/profiles";
import { Screen } from "@/game/screen";
import { StartGate } from "@/game/ui";
import { cn } from "@/lib/cn";
import { ASSETS } from "@/lib/assets";
import { usePageMeta } from "@/lib/seo";

export const Route = createFileRoute("/play/server")({ component: ServerSelect });

/*
  SERVER SELECT: the original servers were Hong Kong landmarks standing on an isometric map
  of the city (server/map + one building per server). The map is wider than the 800 px screen
  and pans to the chosen building.
*/

const S = `${ASSETS}/ui-hd/server`;
const MAP_W = 1052;

// x, y: where the building's base stands on the map
const SERVERS = [
  { id: "tst", zh: "尖沙咀鐘樓", en: "Clock Tower", x: 62, y: 214 },
  { id: "coliseum", zh: "紅磡體育館", en: "Hung Hom Coliseum", x: 186, y: 150 },
  { id: "penhotel", zh: "半島酒店", en: "The Peninsula", x: 168, y: 276 },
  { id: "space", zh: "太空館", en: "Space Museum", x: 292, y: 304 },
  { id: "museum", zh: "藝術館", en: "Museum of Art", x: 348, y: 214 },
  { id: "ifc", zh: "國際金融中心", en: "IFC", x: 456, y: 160 },
  { id: "peak", zh: "凌霄閣", en: "The Peak", x: 604, y: 96 },
  { id: "central", zh: "中環", en: "Central", x: 532, y: 250 },
  { id: "hkbank", zh: "匯豐總行", en: "HSBC Main Building", x: 652, y: 236 },
  { id: "boc", zh: "中銀大廈", en: "Bank of China Tower", x: 762, y: 202 },
  { id: "council", zh: "立法會", en: "Legislative Council", x: 900, y: 266 },
] as const;

function ServerSelect() {
  const { t } = useLingui();
  usePageMeta(
    t`選擇伺服器`,
    t`選擇伺服器：原作用香港地標做的伺服器地圖——鐘樓、體育館、半島酒店，選一棟進場。`,
  );
  const navigate = useNavigate();
  const [sel, setSel] = useState(() =>
    Math.max(
      0,
      SERVERS.findIndex((s) => s.id === getServer()),
    ),
  );
  const [wave, setWave] = useState(0); // REFRESH replays the drop-in
  const s = SERVERS[sel];
  const pan = Math.max(0, Math.min(MAP_W - 800, s.x - 400));

  const move = useCallback((d: number) => {
    audio.sfx("johnnymove.wav", { volume: 0.6 });
    setSel((i) => (i + d + SERVERS.length) % SERVERS.length);
  }, []);
  const ok = useCallback(() => {
    audio.sfx("johnnyconfirm.wav");
    setServer(SERVERS[sel].id);
    void navigate({ to: "/play/profile" });
  }, [sel, navigate]);
  const cancel = useCallback(() => {
    audio.sfx("johnnymove.wav", { volume: 0.6 });
    void navigate({ to: "/" });
  }, [navigate]);
  const refresh = useCallback(() => {
    audio.sfx("johnnymove.wav", { volume: 0.6 });
    setWave((w) => w + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") move(1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(-1);
      else if (e.key === "Enter" || e.code === "KeyJ") ok();
      else if (e.key === "Escape") cancel();
      else if (e.code === "KeyR") refresh();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [move, ok, cancel, refresh]);

  // the server list plays the lobby theme (LFO.exe scene 10, as the profile screen after it)
  const onStart = useCallback(() => audio.music("lfo_lobby.ogg", 0.35), []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0e1320] text-foreground select-none">
      <StartGate onStart={onStart} />
      <Screen className="bg-[radial-gradient(90%_70%_at_50%_30%,#34405c,#161c2b_70%)]">
        {/* the city */}
        <motion.div
          className="absolute top-[28px] left-0 h-[486px] [mask-image:linear-gradient(to_bottom,#000_62%,transparent_80%)]"
          style={{ width: MAP_W }}
          animate={{ x: -pan }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
        >
          <img
            src={`${S}/map.webp`}
            srcSet={`${S}/map.webp 4x`}
            alt=""
            className="absolute inset-0"
            draggable={false}
          />
          {SERVERS.map((b, i) => {
            const on = i === sel;
            return (
              <motion.button
                key={`${b.id}-${wave}`}
                type="button"
                onClick={() => (on ? ok() : setSel(i))}
                onMouseEnter={() => sel !== i && move(i - sel)}
                className="absolute -translate-x-1/2 -translate-y-full"
                style={{ left: b.x, top: b.y, zIndex: b.y }}
                initial={{ opacity: 0, y: -80 }}
                animate={{ opacity: 1, y: on ? [0, -8, 0] : 0 }}
                transition={
                  on
                    ? {
                        y: { duration: 0.9, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" },
                        opacity: { duration: 0.3 },
                      }
                    : { type: "spring", stiffness: 300, damping: 18, delay: i * 0.05 }
                }
                aria-label={b.zh}
                aria-pressed={on}
              >
                <img
                  src={`${S}/${b.id}.webp`}
                  srcSet={`${S}/${b.id}.webp 4x`}
                  alt=""
                  className={cn(
                    "transition",
                    on
                      ? "drop-shadow-[0_0_10px_#fff] brightness-110"
                      : "brightness-[0.8] saturate-[0.8] hover:brightness-100",
                  )}
                  draggable={false}
                />
              </motion.button>
            );
          })}
        </motion.div>

        <TextPill skin="cancel" onClick={cancel} className="absolute top-[12px] right-[14px]" />
        <TextPill skin="refresh" onClick={refresh} className="absolute top-[50px] right-[14px]" />

        {/* SERVER SELECT bar, redrawn in SVG */}
        <div className="absolute top-[384px] left-[78px]">
          <ServerBar>
            <AnimatePresence mode="wait">
              <motion.div
                key={s.id}
                className="flex h-full flex-col items-center justify-start pt-[6px] text-center"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <p className="font-black text-[34px] text-white leading-none [text-shadow:0_2px_0_rgb(0_0_0/0.35)]">
                  {s.zh}
                </p>
                <p className="mt-2 font-lfo text-[13px] text-white/80 uppercase tracking-[0.2em]">
                  {s.en}
                </p>
                <p className="mt-4 flex items-center gap-2 text-[12px] text-white/75">
                  <span className="size-2 rounded-full bg-[#ffd447] shadow-[0_0_6px_#ffd447]" />
                  {t`單機重現 · 本機伺服器`}
                </p>
              </motion.div>
            </AnimatePresence>
          </ServerBar>
          <IconButton
            glyph="left"
            onClick={() => move(-1)}
            className="absolute top-[97px] -left-[46px]"
            aria-label="previous"
          />
          <IconButton
            glyph="right"
            onClick={() => move(1)}
            className="absolute top-[97px] -right-[46px]"
            aria-label="next"
          />
          <IconButton
            glyph="o"
            w={45}
            h={51}
            onClick={ok}
            className="absolute bottom-[14px] left-1/2 -translate-x-1/2"
            aria-label={t`確定`}
          />
        </div>
      </Screen>
    </div>
  );
}
