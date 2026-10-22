import { useLingui } from "@lingui/react/macro";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useEffect, useEffectEvent, useState } from "react";
import { audio } from "@/game/audio";
import {
  type Bracket,
  newBracket,
  pairs,
  playRound,
  ROUND_NAMES,
  team,
  yourMatch,
  yourTeam,
} from "@/game/champion";
import { useCup } from "@/game/champion-store";
import { MetalButton } from "@/game/kit/buttons";
import { Ui } from "@/game/kit/ui";
import { getActiveProfile, playKey, useActiveProfile } from "@/game/profiles";
import { Screen } from "@/game/screen";
import { rosterQueries, StartGate, useRoster } from "@/game/ui";
import { ASSETS } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { usePageMeta } from "@/lib/seo";

/*
  王者爭霸 on the client's bracket (champion/championbox, 800 × 600): the eight teams under the
  bracket's leaves (championteam, two heads each), each round's winners written on the nodes they
  reach, 戰鬥中… (fightbubble) over the match being played, the 互動電視 logo in the corner.
*/

export const Route = createFileRoute("/play/champion")({
  beforeLoad: () => {
    if (!getActiveProfile()) throw redirect({ to: "/play/profile" });
  },
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(rosterQueries[0]),
      queryClient.ensureQueryData(rosterQueries[1]),
    ]),
  component: Champion,
});

// measured from championbox: the leaves, then each round's meeting points
const LEAF_X = [54, 137, 252, 334, 467, 550, 665, 748];
const NODE = [
  { y: 300, x: [95, 293, 508, 706] },
  { y: 215, x: [192, 610] },
  { y: 128, x: [400] },
];

function Champion() {
  const { t } = useLingui();
  usePageMeta(t`王者爭霸`, t`王者爭霸：八隊單淘汰的原作賽程，一路打上去，看誰坐上冠軍的位置。`);
  const navigate = useNavigate();
  const profile = useActiveProfile();
  const roster = useRoster().filter((r) => r.id < 7000);
  const bracket = useCup((s) => s.bracket);
  const setBracket = useCup((s) => s.set);
  const [focus, setFocus] = useState(0);

  // a new cup when there is none (or the last one is over and you start again)
  useEffect(() => {
    if (bracket || !profile || !roster.length) return;
    const keys = roster.map((r) => r.key);
    const partner = keys[Math.floor(Math.random() * keys.length)];
    setBracket(
      newBracket({ name: profile.name, key: playKey(profile), lv: profile.lv }, partner, keys),
    );
  }, [bracket, profile, roster, setBracket]);

  if (!bracket || !profile) return <div className="fixed inset-0 bg-black" />;
  const head = (key: string) => roster.find((r) => r.key === key)?.id;
  const mine = yourMatch(bracket);
  const me = yourTeam(bracket);
  const round = bracket.rounds.length - 1;
  const over = bracket.champion !== null;
  const won = over && bracket.champion === me.id;
  // the teams still in it (once the cup is over, only the champion)
  const alive = over ? [bracket.champion] : bracket.rounds[round];
  // which of this round's matches is yours, for the 戰鬥中… bubble over its meeting point
  const myPair = mine ? pairs(bracket).findIndex(([a]) => a === mine[0]) : -1;

  const fight = () => {
    if (!mine) return;
    audio.sfx("johnnyconfirm.wav");
    const foe = team(bracket, mine[0] === me.id ? mine[1] : mine[0]);
    void navigate({
      to: "/play/vs/$stage",
      params: { stage: "vs_champion" },
      search: {
        room: JSON.stringify({
          stage: "vs_champion",
          name: "LFO 皇者爭霸戰",
          team: 1,
          coms: [
            { key: me.members[1].key, team: 1, lv: me.members[1].lv },
            ...foe.members.map((m) => ({ key: m.key, team: 2, lv: m.lv })),
          ],
        }),
        cup: true,
      },
    });
  };
  // out of the cup: the rest of the rounds play out without you
  const watch = () => {
    let b: Bracket = bracket;
    while (b.champion === null) b = playRound(b, null);
    setBracket(b);
    audio.sfx("johnnymove.wav");
  };
  const again = () => {
    setBracket(null);
    audio.sfx("johnnychoose.wav");
  };
  const leave = () => void navigate({ to: "/play/lobby" });

  const actions = over
    ? [
        { label: t`再來一屆`, run: again },
        { label: t`離開`, run: leave },
      ]
    : mine
      ? [
          { label: t`開始比賽`, run: fight },
          { label: t`離開`, run: leave },
        ]
      : [
          { label: t`觀看賽果`, run: watch },
          { label: t`離開`, run: leave },
        ];

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-foreground select-none">
      <StartGate onStart={() => audio.music("lfo_advent.ogg", 0.35)} />
      <Keys actions={actions} focus={focus} setFocus={setFocus} />
      <Screen>
        <Ui name="champion/championbox" w={800} h={600} className="absolute inset-0" />
        <Ui
          name="champion/tictvlogo"
          w={85}
          h={127}
          className="absolute top-[30px] left-[690px] scale-75"
        />

        {/* the eight teams under the leaves */}
        {bracket.rounds[0].map((id, i) => {
          const tm = team(bracket, id);
          const out = !alive.includes(id);
          return (
            <div
              key={id}
              className={cn("absolute h-[111px] w-[56px]", out && "opacity-45 grayscale")}
              style={{ left: LEAF_X[i] - 28, top: 386 }}
            >
              <Ui
                name="champion/championteamback"
                w={55}
                h={100}
                className="absolute top-[5px] left-0"
              />
              <Ui name="champion/championteam" w={56} h={111} className="absolute inset-0" />
              {tm.members.map((m, k) => (
                <img
                  key={k}
                  src={`${ASSETS}/ui-hd/waitplayer/waitsprite${head(m.key)}.webp`}
                  alt=""
                  className="absolute left-[11px] h-[25px] w-[33px]"
                  style={{ top: 12 + k * 33 }}
                  draggable={false}
                />
              ))}
              <p
                className={cn(
                  "absolute top-[82px] left-1/2 w-[80px] -translate-x-1/2 truncate text-center font-bold text-[10px]",
                  // the card is white: dark lettering, yours in the event's red
                  tm.you ? "text-[#b3261e]" : "text-[#2a2d33]",
                )}
              >
                {tm.name}
              </p>
            </div>
          );
        })}

        {/* winners on the nodes they reached */}
        {bracket.rounds.slice(1).map((ids, r) =>
          ids.map((id, i) => (
            <motion.p
              key={`${r}-${id}`}
              className={cn(
                "absolute -translate-x-1/2 rounded-[4px] bg-black/70 px-1.5 py-[1px] font-bold text-[11px] whitespace-nowrap",
                team(bracket, id).you ? "text-[#ffe08a]" : "text-white",
              )}
              style={{ left: NODE[r].x[i], top: NODE[r].y - 22 }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {team(bracket, id).name}
            </motion.p>
          )),
        )}

        {/* 戰鬥中… over your match */}
        {mine && myPair >= 0 && (
          <motion.div
            className="absolute"
            style={{ left: NODE[round].x[myPair] - 38, top: NODE[round].y + 4 }}
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 1.2, repeat: Number.POSITIVE_INFINITY }}
          >
            <Ui name="champion/fightbubble" w={76} h={42} />
          </motion.div>
        )}

        {/* the band: where the cup stands, and what to do */}
        <div className="absolute top-[506px] left-[40px] flex h-[34px] w-[720px] items-center justify-between">
          <p className="font-bold text-[14px] text-white">
            {over
              ? won
                ? t`恭喜！${me.name}成為 LFO 皇者！`
                : t`${team(bracket, bracket.champion!).name}奪得皇者寶座`
              : mine
                ? t`${ROUND_NAMES[round]}：${team(bracket, mine[0]).name} 對 ${team(bracket, mine[1]).name}`
                : t`${me.name}已出局`}
          </p>
          <div className="flex gap-2">
            {actions.map((a, i) => (
              <MetalButton
                key={a.label}
                active={focus === i}
                onMouseEnter={() => setFocus(i)}
                onClick={a.run}
                className="h-[30px] w-[120px] text-[13px]"
              >
                {a.label}
              </MetalButton>
            ))}
          </div>
        </div>
      </Screen>
    </div>
  );
}

/** ← → pick, Enter / J run, Esc leaves. */
function Keys({
  actions,
  focus,
  setFocus,
}: {
  actions: { label: string; run: () => void }[];
  focus: number;
  setFocus: (f: number) => void;
}) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") setFocus((focus + 1) % actions.length);
    else if (e.key === "Enter" || e.code === "KeyJ")
      actions[Math.min(focus, actions.length - 1)].run();
    else if (e.key === "Escape") actions.at(-1)!.run();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);
  return null;
}
