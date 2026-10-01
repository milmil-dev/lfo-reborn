import { useLingui } from "@lingui/react/macro";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { audio } from "@/game/audio";
import {
  Arrow,
  ChatPanel,
  Head,
  LevelArrows,
  Pill,
  ROW_STEP,
  ROW_Y,
  Row,
  Tag,
  TeamBadge,
} from "@/game/kit/room";
import { Ui } from "@/game/kit/ui";
import { realtimeUrl, RoomClient } from "@/game/net/client";
import { NetRun } from "@/game/net/net-run";
import { canStart, MAX_SEATS, roomName, type RoomState } from "@/game/net/protocol";
import { RoomList } from "@/game/net/room-list";
import { getActiveProfile, useActiveProfile } from "@/game/profiles";
import { Screen } from "@/game/screen";
import { catalogQuery } from "@/game/stage-select";
import { rosterQueries, StartGate, useRoster } from "@/game/ui";
import { stepLevel, TEAM_COUNT } from "@/game/vs";
import { cn } from "@/lib/cn";
import { usePageTitle } from "@/lib/title";

/*
  連線對戰 — without a code, the client's 選擇遊戲室 list (game/net/room-list.tsx): the listed
  rooms, a code box for a friend's room, and 建立遊戲室. With a code, the room itself on the
  realtime Worker (realtime/): the same waitplayer/ rows as the local room — everyone picks a
  character and a team and says 準備; the host sets the stage and the one level everyone fights
  at, names the room, lists or hides it, adds COM players and starts. The bout is
  game/net/net-run.tsx.
*/

export const Route = createFileRoute("/play/online")({
  validateSearch: z.object({
    code: z.string().optional().catch(undefined),
    // a room being made: its name and listing, which the host sends once seated
    name: z.string().optional().catch(undefined),
    listed: z.boolean().optional().catch(undefined),
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
  component: OnlinePage,
});

function OnlinePage() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const { code, name, listed } = Route.useSearch();
  const base = realtimeUrl();
  usePageTitle(code ? t`連線遊戲室 ${code}` : t`選擇遊戲室`);
  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-foreground select-none">
      <StartGate onStart={() => audio.music("lfo_character.ogg", 0.35)} />
      {!base ? (
        <Notice text={t`連線對戰尚未開放：這個版本沒有設定對戰伺服器。`} />
      ) : code ? (
        <RoomView
          base={base}
          code={code.toUpperCase()}
          pending={name !== undefined ? { name, listed: listed ?? true } : null}
        />
      ) : (
        <Screen>
          <RoomList
            base={base}
            onJoin={(c) => void navigate({ to: "/play/online", search: { code: c } })}
            onCreate={(c, n, l) =>
              void navigate({ to: "/play/online", search: { code: c, name: n, listed: l } })
            }
            onBack={() => void navigate({ to: "/play/lobby" })}
          />
        </Screen>
      )}
    </div>
  );
}

function Notice({ text }: { text: string }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  return (
    <Screen>
      <Ui name="newgame/backg2" w={800} h={600} className="absolute inset-0 opacity-60" />
      <div className="absolute inset-x-0 top-[260px] text-center">
        <p className="font-bold text-[16px] text-white [text-shadow:0_1px_2px_#000]">{text}</p>
        <Pill className="mt-6" onClick={() => void navigate({ to: "/play/lobby" })}>
          {t`返回大廳`}
        </Pill>
      </div>
    </Screen>
  );
}

type Pending = { name: string; listed: boolean };

function RoomView({
  base,
  code,
  pending,
}: {
  base: string;
  code: string;
  pending: Pending | null;
}) {
  const profile = useActiveProfile();
  const { data: catalog } = useSuspenseQuery(catalogQuery);
  const stages = catalog.filter((e) => e.mode === "vs");
  const roster = useRoster().filter((r) => r.id < 7000);
  // the socket lives with the effect (StrictMode mounts twice; the first client is closed)
  const name = profile?.name ?? "LFO";
  const [client, setClient] = useState<RoomClient | null>(null);
  useEffect(() => {
    const c = new RoomClient(base, code, name);
    setClient(c);
    return () => {
      c.close();
      setClient(null);
    };
  }, [base, code, name]);
  return client ? (
    <ConnectedRoom client={client} code={code} roster={roster} stages={stages} pending={pending} />
  ) : (
    <Screen>
      <Ui name="newgame/backg2" w={800} h={600} className="absolute inset-0 opacity-60" />
    </Screen>
  );
}

function ConnectedRoom({
  client,
  code,
  roster,
  stages,
  pending,
}: {
  client: RoomClient;
  code: string;
  roster: ReturnType<typeof useRoster>;
  stages: { key: string; title: string }[];
  pending: Pending | null;
}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const profile = useActiveProfile();
  const net = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const { room, you } = net;
  const me = room && you >= 0 ? room.seats[you] : null;
  const isHost = you === 0;
  const [fight, setFight] = useState<{ room: RoomState; you: number } | null>(null);

  // the fight starts for everyone on the room's word
  useEffect(
    () =>
      client.onMessage((m) => {
        if (m.t !== "start") return;
        const s = client.getSnapshot();
        if (s.room) setFight({ room: s.room, you: s.you });
      }),
    [client],
  );
  // sit down as the character the profile plays
  const picked = me?.key;
  useEffect(() => {
    if (me && !picked && profile?.key) client.send({ t: "seat", key: profile.key });
  }, [client, me, picked, profile?.key]);
  // the room's maker names it and lists (or hides) it, once seated as its host
  const [named, setNamed] = useState(false);
  useEffect(() => {
    if (named || !pending || !room || you !== 0) return;
    setNamed(true);
    client.send({ t: "rules", rules: { name: pending.name, listed: pending.listed } });
  }, [client, named, pending, room, you]);

  const leave = () => {
    audio.sfx("johnnymove.wav", { volume: 0.6 });
    client.close();
    void navigate({ to: "/play/online", search: { code: undefined } });
  };
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "Escape") leave();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);

  if (fight)
    return (
      <NetRun client={client} room={fight.room} you={fight.you} onDone={() => setFight(null)} />
    );

  const cycle = (n: number, d: number, len: number) => (n + d + len) % len;
  const stageAt = stages.findIndex((e) => e.key === room?.rules.stage);
  const entry = stages[stageAt];
  const ok = !!room && canStart(room.seats);
  const start = () => {
    if (!isHost) return;
    if (!ok) return audio.sfx("guard.wav");
    audio.sfx("johnnyconfirm.wav");
    client.send({ t: "start" });
  };
  const chat = [
    {
      who: null,
      text: room?.rules.listed
        ? t`遊戲室「${code}」已公開在列表；朋友也可以在「選擇遊戲室」輸入房號加入。`
        : t`遊戲室「${code}」不在列表上：把這個房號告訴朋友，他們在「選擇遊戲室」輸入就能加入。`,
    },
    { who: null, text: t`所有人都會以房間的等級出戰，招式等級一律 LV 1。` },
    ...net.chat.map((l) => ({ who: room?.seats[l.seat]?.name ?? `P${l.seat + 1}`, text: l.text })),
  ];
  const problem =
    net.error === "version"
      ? t`你的遊戲版本和主持不同，請重新整理頁面再加入。`
      : net.error === "full"
        ? t`這間遊戲室已滿。`
        : net.error === "started"
          ? t`這間遊戲室已經開始了。`
          : net.status === "closed"
            ? t`已離開遊戲室。`
            : null;

  return (
    <Screen>
      <Ui name="newgame/backg2" w={800} h={600} className="absolute inset-0 opacity-60" />
      <div className="absolute top-[22px] left-[24px] w-[440px]">
        <p className="truncate font-black text-[24px] text-white italic [text-shadow:0_2px_0_#000]">
          {room ? roomName(room) : t`連線遊戲室`}{" "}
          <span className="font-lfo text-[18px] tracking-[0.3em]">{code}</span>
        </p>
        <p className="mt-1 font-bold text-[14px] text-[#ffe08a] [text-shadow:0_1px_2px_#000]">
          VS · {entry?.title ?? room?.rules.stage ?? "…"} · LV {room?.rules.level ?? "…"}
        </p>
      </div>

      {problem ? (
        <div className="absolute top-[200px] left-[24px] w-[433px]">
          <p className="font-bold text-[14px] text-white">{problem}</p>
          <Pill className="mt-5" onClick={leave}>
            {t`返回`}
          </Pill>
        </div>
      ) : !room ? (
        <p className="absolute top-[200px] left-[24px] font-bold text-[14px] text-white/80">
          {t`連接中…`}
        </p>
      ) : (
        <>
          {room.seats.map((s, i) => {
            const who = roster.find((r) => r.key === s.key);
            const at = roster.findIndex((r) => r.key === s.key);
            const mine = i === you;
            return (
              <Row
                key={`seat-${i}`}
                y={ROW_Y + i * ROW_STEP}
                art={s.com ? "computerslot" : "players"}
              >
                {isHost && i > 0 && (
                  <button
                    type="button"
                    className="absolute top-0 left-0 h-[33px] w-[30px]"
                    onClick={() => client.send({ t: "kick", seat: i })}
                    aria-label={s.com ? t`移除電腦` : t`請離`}
                  />
                )}
                {mine && (
                  <Arrow
                    dir="l"
                    onClick={() =>
                      client.send({ t: "seat", key: roster[cycle(at, -1, roster.length)].key })
                    }
                  />
                )}
                {who ? <Head id={who.id} /> : <span className="w-[33px]" />}
                {mine && (
                  <Arrow
                    dir="r"
                    onClick={() =>
                      client.send({ t: "seat", key: roster[cycle(at, 1, roster.length)].key })
                    }
                  />
                )}
                <span
                  className={cn(
                    "truncate font-bold text-[13px]",
                    s.online ? "text-white" : "text-white/40",
                  )}
                >
                  {s.name}{" "}
                  <span className="text-[10px] text-white/60">
                    {s.com ? "COM" : (who?.name ?? "")}
                  </span>
                </span>
                {i === 0 && <Tag>{t`主持`}</Tag>}
                {mine && <Tag tone="green">{t`你`}</Tag>}
                {!s.com && !s.online && <Tag tone="dim">{t`離線`}</Tag>}
                <span className="ml-auto" />
                {!s.com &&
                  (mine ? (
                    <Tag
                      tone={s.ready ? "green" : "gold"}
                      onClick={() => client.send({ t: "ready", on: !s.ready })}
                    >
                      {s.ready ? t`✓ 準備好` : t`準備`}
                    </Tag>
                  ) : (
                    <Tag tone={s.ready ? "green" : "dim"}>{s.ready ? t`✓ 準備好` : t`未準備`}</Tag>
                  ))}
                <TeamBadge
                  team={s.team}
                  onClick={
                    mine
                      ? () => client.send({ t: "seat", team: cycle(s.team, 1, TEAM_COUNT + 1) })
                      : undefined
                  }
                />
              </Row>
            );
          })}

          {/* the host's controls: stage, level, COM players */}
          {isHost && (
            <div className="absolute top-[330px] left-[24px] flex w-[433px] flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-white">
              <span className="flex items-center gap-1">
                <Arrow
                  dir="l"
                  onClick={() =>
                    client.send({
                      t: "rules",
                      rules: { stage: stages[cycle(stageAt, -1, stages.length)].key },
                    })
                  }
                />
                <span className="w-[110px] truncate text-center font-bold">
                  {entry?.title ?? room.rules.stage}
                </span>
                <Arrow
                  dir="r"
                  onClick={() =>
                    client.send({
                      t: "rules",
                      rules: { stage: stages[cycle(stageAt, 1, stages.length)].key },
                    })
                  }
                />
              </span>
              <span className="flex items-center gap-1">
                <span className="font-lfo text-[10px] text-white/80">LV {room.rules.level}</span>
                <LevelArrows
                  onUp={() =>
                    client.send({ t: "rules", rules: { level: stepLevel(room.rules.level, 1) } })
                  }
                  onDown={() =>
                    client.send({ t: "rules", rules: { level: stepLevel(room.rules.level, -1) } })
                  }
                />
              </span>
              <Tag
                tone={room.rules.listed ? "green" : "dim"}
                onClick={() => client.send({ t: "rules", rules: { listed: !room.rules.listed } })}
              >
                {room.rules.listed ? t`公開` : t`私人`}
              </Tag>
              {room.seats.length < MAX_SEATS && (
                <Tag
                  onClick={() => {
                    audio.sfx("johnnychoose.wav");
                    const pick = roster[Math.floor(Math.random() * roster.length)];
                    client.send({ t: "com", key: pick.key, team: 2 });
                  }}
                >
                  {t`加入電腦玩家`}
                </Tag>
              )}
            </div>
          )}

          <div className="absolute top-[366px] left-[24px] w-[433px] text-[11px] text-white/70 leading-relaxed">
            {isHost
              ? ok
                ? t`所有人準備好了，按 LAUNCH? 開始。`
                : t`每個人都要選好角色並按「準備」，而且要有兩個隊伍。`
              : me?.ready
                ? t`等待主持開始…`
                : t`選好角色、隊伍，按「準備」。`}
          </div>

          {isHost && (
            <button
              type="button"
              onClick={start}
              className={cn(
                "absolute top-[392px] left-[24px] h-[25px] w-[143px] transition",
                !ok && "opacity-40 grayscale",
              )}
              aria-label="LAUNCH"
            >
              <Ui name="waitplayer/launch" w={143} h={25} />
            </button>
          )}
          <Pill
            className="absolute top-[392px] left-[184px] h-[25px] px-4 text-[12px]"
            onClick={leave}
            dim
          >
            {t`離開遊戲室`}
          </Pill>
        </>
      )}

      <ChatPanel lines={chat} onSend={(text) => client.send({ t: "chat", text })} />
    </Screen>
  );
}
