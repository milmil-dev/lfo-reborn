import { useLingui } from "@lingui/react/macro";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useEffectEvent, useState } from "react";
import { z } from "zod";
import { audio } from "@/game/audio";
import { availableDevices, type Device, onDevices, padIndex } from "@/game/input";
import { Ui } from "@/game/kit/ui";
import { getActiveProfile, useActiveProfile } from "@/game/profiles";
import { Screen } from "@/game/screen";
import { catalogQuery } from "@/game/stage-select";
import { rosterQueries, StartGate, useRoster } from "@/game/ui";
import {
  canLaunch,
  type Com,
  type Guest,
  MAX_FIGHTERS,
  type RoomSetup,
  seatCount,
  stepLevel,
  TEAM_COUNT,
} from "@/game/vs";
import { ASSETS } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { usePageTitle } from "@/lib/title";

/*
  遊戲室 — the VS waiting room (waitplayer/): the line-up as the client's rows (players /
  computerslot / addcom, 433 × 33), each with the character's head (waitsprite<id>), a team badge
  and, for a COM, ◀ ▶ to change character and ▲ ▼ its level; LAUNCH? starts the bout. Other
  players at this machine join on the second keyboard layout or a gamepad of their own (their
  row names the device). The room chat on the right (chat_area) carries the client's own room lines.
*/

export const Route = createFileRoute("/play/room")({
  validateSearch: z.object({
    stage: z.string().catch("vs_school"),
    name: z.string().catch(""),
  }),
  beforeLoad: () => {
    if (!getActiveProfile()) throw redirect({ to: "/play/profile" });
  },
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(catalogQuery),
      queryClient.ensureQueryData(rosterQueries[0]),
      queryClient.ensureQueryData(rosterQueries[1]),
    ]),
  component: WaitingRoom,
});

const ROW_X = 24;
const ROW_Y = 150;
const ROW_STEP = 46;
const TEAM_COLOR = ["#9aa0aa", "#e5484d", "#3e8ef7", "#3fbf6b", "#f2c230"];

function Head({ id }: { id: number }) {
  return (
    <img
      src={`${ASSETS}/ui-hd/waitplayer/waitsprite${id}.webp`}
      alt=""
      draggable={false}
      className="h-[25px] w-[33px]"
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}

function TeamBadge({ team, onClick }: { team: number; onClick?: () => void }) {
  const { t } = useLingui();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="relative grid h-[28px] w-[40px] place-items-center"
      aria-label={team ? t`第${team}隊` : t`獨立`}
    >
      <Ui name="waitplayer/team" w={40} h={28} className="absolute inset-0" />
      <span
        className="relative font-bold text-[12px] text-white [text-shadow:0_1px_1px_#000]"
        style={{ color: team ? TEAM_COLOR[team] : "#5b616b", textShadow: "none" }}
      >
        {team ? team : t`獨`}
      </span>
    </button>
  );
}

function WaitingRoom() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { stage, name } = Route.useSearch();
  const profile = useActiveProfile();
  const { data: catalog } = useSuspenseQuery(catalogQuery);
  const roster = useRoster().filter((r) => r.id < 7000);
  const entry = catalog.find((e) => e.key === stage);
  const roomName = name || t`${profile?.name ?? "LFO"}的遊戲室`;
  usePageTitle(roomName);

  const [team, setTeam] = useState(1);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [coms, setComs] = useState<Com[]>([]);
  const [focus, setFocus] = useState<"launch" | "back">("launch");
  // gamepads plugged in or pulled out change which devices a new player can take
  const [, setPads] = useState(0);
  useEffect(() => onDevices(() => setPads((n) => n + 1)), []);

  const setup: RoomSetup = { stage, name: roomName, team, coms, guests };
  const ok = canLaunch(setup);
  const seats = seatCount(setup);
  const free = availableDevices(["kb", ...guests.map((g) => g.device)]);

  const deviceLabel = (d: Device) =>
    d === "kb" ? t`鍵盤 1` : d === "kb2" ? t`鍵盤 2` : t`手掣 ${(padIndex(d) ?? 0) + 1}`;

  const cycle = (n: number, d: number, len: number) => (n + d + len) % len;
  const randomChar = () => roster[Math.floor(Math.random() * roster.length)].key;
  const addCom = () => {
    if (seats >= MAX_FIGHTERS) return;
    audio.sfx("johnnychoose.wav");
    setComs((c) => [...c, { key: randomChar(), team: 2, lv: 1 }]);
  };
  const addGuest = () => {
    if (seats >= MAX_FIGHTERS || !free.length) return audio.sfx("guard.wav");
    audio.sfx("johnnychoose.wav");
    // a guest starts at your level, so the bout is even until someone moves the arrows
    setGuests((g) => [...g, { key: randomChar(), team: 2, lv: profile?.lv ?? 1, device: free[0] }]);
  };
  const setCom = (i: number, patch: Partial<Com>) =>
    setComs((c) => c.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const setGuest = (i: number, patch: Partial<Guest>) =>
    setGuests((g) => g.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  /** The guest's device moves on to the next one nobody holds. */
  const cycleDevice = (i: number) => {
    const ring = [guests[i].device, ...free];
    setGuest(i, { device: ring[(ring.indexOf(guests[i].device) + 1) % ring.length] });
  };

  const launch = () => {
    if (!ok) return audio.sfx("guard.wav");
    audio.sfx("johnnyconfirm.wav");
    void navigate({
      to: "/play/vs/$stage",
      params: { stage },
      search: { room: JSON.stringify(setup) },
    });
  };
  const back = () => {
    audio.sfx("johnnymove.wav", { volume: 0.6 });
    void navigate({ to: "/play/vs" });
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") back();
    else if (e.key === "Enter") (focus === "launch" ? launch : back)();
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight")
      setFocus((f) => (f === "launch" ? "back" : "launch"));
    else if (e.code === "KeyA" || e.key === "+") addCom();
    else if (e.code === "KeyP") addGuest();
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);

  const lines = [
    t`「${roomName}」建立成功！`,
    t`等候開始「${entry?.title ?? stage}」！`,
    t`注意︰其他玩家不准在遊戲開始後加入。`,
    t`VS模式勝利條件:「最先打倒隊方所有成員」！`,
    ...guests.map((g, i) => t`玩家${i + 2}（${deviceLabel(g.device)}）加入了遊戲室！`),
    ...(guests.some((g) => g.device === "kb2")
      ? [t`鍵盤 2：T F G H 移動，Z 攻擊、X 跳躍、C 防禦，V 道具、B 丟棄。`]
      : []),
  ];
  const me = roster.find((r) => r.key === profile?.key);
  const rowY = (slot: number) => ROW_Y + slot * ROW_STEP;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-foreground select-none">
      <StartGate onStart={() => audio.music("lfo_character.ogg", 0.35)} />
      <Screen>
        <Ui name="newgame/backg2" w={800} h={600} className="absolute inset-0 opacity-60" />
        <div className="absolute top-[22px] left-[24px] w-[440px]">
          <p className="truncate font-black text-[24px] text-white italic [text-shadow:0_2px_0_#000]">
            {roomName}
          </p>
          <p className="mt-1 font-bold text-[14px] text-[#ffe08a] [text-shadow:0_1px_2px_#000]">
            VS · {entry?.title ?? stage}
          </p>
        </div>

        {/* you */}
        <Row y={rowY(0)} art="players">
          {me && <Head id={me.id} />}
          <span className="truncate font-bold text-[13px] text-white">{profile?.name}</span>
          <span className="font-lfo text-[10px] text-white/70">LV {profile?.lv}</span>
          <DeviceTag>{deviceLabel("kb")}</DeviceTag>
          <span className="ml-auto" />
          <TeamBadge team={team} onClick={() => setTeam((x) => cycle(x, 1, TEAM_COUNT + 1))} />
        </Row>

        {/* the other players at this machine */}
        <AnimatePresence initial={false}>
          {guests.map((g, i) => {
            const who = roster.find((r) => r.key === g.key);
            const at = roster.findIndex((r) => r.key === g.key);
            return (
              <motion.div
                key={`guest-${i}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
              >
                <Row y={rowY(1 + i)} art="players">
                  <button
                    type="button"
                    className="absolute top-0 left-0 h-[33px] w-[30px]"
                    onClick={() => setGuests((x) => x.filter((_, n) => n !== i))}
                    aria-label={t`移除玩家`}
                  />
                  <Arrow
                    dir="l"
                    onClick={() => setGuest(i, { key: roster[cycle(at, -1, roster.length)].key })}
                  />
                  {who && <Head id={who.id} />}
                  <Arrow
                    dir="r"
                    onClick={() => setGuest(i, { key: roster[cycle(at, 1, roster.length)].key })}
                  />
                  <span className="truncate font-bold text-[13px] text-white">
                    {t`玩家${i + 2}`}{" "}
                    <span className="text-[10px] text-white/60">{who?.name ?? g.key}</span>
                  </span>
                  <DeviceTag onClick={() => cycleDevice(i)}>{deviceLabel(g.device)}</DeviceTag>
                  <span className="ml-auto flex items-center gap-1">
                    <span className="w-[42px] text-right font-lfo text-[10px] text-white/80">
                      LV {g.lv}
                    </span>
                    <LevelArrows
                      onUp={() => setGuest(i, { lv: stepLevel(g.lv, 1) })}
                      onDown={() => setGuest(i, { lv: stepLevel(g.lv, -1) })}
                    />
                  </span>
                  <TeamBadge
                    team={g.team}
                    onClick={() => setGuest(i, { team: cycle(g.team, 1, TEAM_COUNT + 1) })}
                  />
                </Row>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* the COM players */}
        <AnimatePresence initial={false}>
          {coms.map((c, i) => {
            const who = roster.find((r) => r.key === c.key);
            const at = roster.findIndex((r) => r.key === c.key);
            return (
              <motion.div
                key={`com-${i}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
              >
                <Row y={rowY(1 + guests.length + i)} art="computerslot">
                  <button
                    type="button"
                    className="absolute top-0 left-0 h-[33px] w-[30px]"
                    onClick={() => setComs((x) => x.filter((_, n) => n !== i))}
                    aria-label={t`移除電腦`}
                  />
                  <Arrow
                    dir="l"
                    onClick={() => setCom(i, { key: roster[cycle(at, -1, roster.length)].key })}
                  />
                  {who && <Head id={who.id} />}
                  <Arrow
                    dir="r"
                    onClick={() => setCom(i, { key: roster[cycle(at, 1, roster.length)].key })}
                  />
                  <span className="truncate font-bold text-[13px] text-white">
                    {who?.name ?? c.key} <span className="text-[10px] text-white/60">COM</span>
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <span className="w-[42px] text-right font-lfo text-[10px] text-white/80">
                      LV {c.lv}
                    </span>
                    <LevelArrows
                      onUp={() => setCom(i, { lv: stepLevel(c.lv, 1) })}
                      onDown={() => setCom(i, { lv: stepLevel(c.lv, -1) })}
                    />
                  </span>
                  <TeamBadge
                    team={c.team}
                    onClick={() => setCom(i, { team: cycle(c.team, 1, TEAM_COUNT + 1) })}
                  />
                </Row>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {seats < MAX_FIGHTERS && (
          <Row y={rowY(seats)} art="addcom">
            <button
              type="button"
              onClick={addCom}
              className="h-full flex-1 pl-[18px] text-left font-bold text-[13px] text-white/80 hover:text-white"
            >
              {t`加入電腦玩家`} <Key>A</Key>
            </button>
            {free.length > 0 && (
              <button
                type="button"
                onClick={addGuest}
                className="h-full flex-1 border-white/20 border-l pl-[12px] text-left font-bold text-[13px] text-white/80 hover:text-white"
              >
                {t`加入本機玩家`} <Key>P</Key>{" "}
                <span className="font-lfo text-[9px] text-[#ffe08a]">{deviceLabel(free[0])}</span>
              </button>
            )}
          </Row>
        )}

        <div className="absolute top-[350px] left-[24px] w-[433px] text-[11px] text-white/70 leading-relaxed">
          {ok
            ? t`按 LAUNCH? 開始。點隊章換隊伍（獨＝各自為戰）；點玩家的裝置名換手掣。`
            : t`加入至少一位不同隊伍的玩家（本機或電腦）才能開始。`}
        </div>

        <button
          type="button"
          onMouseEnter={() => setFocus("launch")}
          onClick={launch}
          className={cn(
            "absolute top-[392px] left-[24px] h-[25px] w-[143px] transition",
            !ok && "opacity-40 grayscale",
            focus === "launch" && ok && "drop-shadow-[0_0_6px_#ffd27a]",
          )}
          aria-label="LAUNCH"
        >
          <Ui name="waitplayer/launch" w={143} h={25} />
        </button>
        <button
          type="button"
          onMouseEnter={() => setFocus("back")}
          onClick={back}
          className={cn(
            "absolute top-[392px] left-[184px] h-[25px] rounded-full border-2 border-white/60 px-4 font-bold text-[12px] text-white",
            focus === "back" ? "bg-white/25" : "bg-black/30",
          )}
        >
          {t`離開遊戲室`}
        </button>

        {/* the room chat */}
        <div className="absolute top-[4px] left-[488px] h-[592px] w-[305px]">
          <Ui name="waitplayer/chat_area" w={305} h={592} className="absolute inset-0" />
          <div className="absolute top-[10px] left-[12px] w-[281px] space-y-[6px] text-[12px]">
            {lines.map((l) => (
              <p key={l} className="text-[#ffe9a8]">
                <span className="text-[#ffb27a]">{t`【系統】`}</span>
                {l}
              </p>
            ))}
          </div>
        </div>
      </Screen>
    </div>
  );
}

function Row({
  y,
  art,
  children,
}: {
  y: number;
  art: "players" | "computerslot" | "addcom";
  children: React.ReactNode;
}) {
  return (
    <div className="absolute h-[33px] w-[433px]" style={{ left: ROW_X, top: y }}>
      <Ui name={`waitplayer/${art}`} w={433} h={33} className="absolute inset-0" />
      <div className="absolute inset-y-0 right-[4px] left-[34px] flex items-center gap-[6px]">
        {children}
      </div>
    </div>
  );
}

/** The device a seat reads; clicking (a guest's) moves on to the next free one. */
function DeviceTag({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "shrink-0 rounded-full bg-black/40 px-[7px] py-px font-lfo text-[9px] text-[#ffe08a] whitespace-nowrap",
        onClick && "hover:bg-black/60",
      )}
    >
      {children}
    </button>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/30 px-1 font-lfo text-[9px] text-white/60">
      {children}
    </kbd>
  );
}

function Arrow({ dir, onClick }: { dir: "l" | "r"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[25px] w-[23px] shrink-0"
      aria-label={dir === "l" ? "◀" : "▶"}
    >
      <Ui name={`waitplayer/arrow_${dir}_s`} w={23} h={25} />
    </button>
  );
}

function LevelArrows({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <span className="relative block h-[25px] w-[17px] shrink-0">
      <Ui name="waitplayer/arrow_ud_s" w={17} h={25} className="absolute inset-0" />
      <button
        type="button"
        onClick={onUp}
        className="absolute inset-x-0 top-0 h-1/2"
        aria-label="LV +"
      />
      <button
        type="button"
        onClick={onDown}
        className="absolute inset-x-0 bottom-0 h-1/2"
        aria-label="LV -"
      />
    </span>
  );
}
