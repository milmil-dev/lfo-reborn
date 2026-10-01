import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { audio } from "@/game/audio";
import type { Fighter } from "@/game/core/fighter";
import { EMPTY_INPUT } from "@/game/core/types";
import { Effects } from "@/game/effects";
import { Controls } from "@/game/input";
import { KeyConfig } from "@/game/key-config";
import { MetalButton } from "@/game/kit/buttons";
import { Ui } from "@/game/kit/ui";
import { RANKS, rankOf } from "@/game/vs";
import {
  ChannelTab,
  ChatBody,
  HudRestore,
  type PanelTab,
  PlateButton,
  SendButton,
  TabBlock,
} from "@/game/kit/chat";
import { SpeechBubble } from "@/game/kit/frames";
import { type Mode, ModeMenu } from "@/game/mode-menu";
import { useItemTable } from "@/game/items-data";
import { Backpack } from "@/game/kit/backpack";
import { CharaCard, Popup, SkillList, Smiley, SmileyBox, type SmileyDef } from "@/game/kit/panels";
import { FloatingPanel } from "@/game/kit/floating";
import { BankBox } from "@/game/kit/bank-box";
import { CardBox } from "@/game/kit/card-box";
import { type Card, itemCards, redeem, type Relic } from "@/game/cards";
import { ShopBox } from "@/game/kit/shop-box";
import { type SmithMode, SmithBox } from "@/game/kit/smith-box";
import { deposit, withdraw } from "@/game/bank";
import {
  buy,
  nearestKeeper,
  type Shelf,
  type ShopEntry,
  type ShopKind,
  sell,
  shopOf,
  stock,
} from "@/game/shop";
import { compose, repair } from "@/game/smith";
import { type Npc, npcNear } from "@/game/npcs";
import {
  getActiveProfile,
  getBank,
  getInventory,
  getServer,
  getOwnedChars,
  getTokens,
  grantChar,
  grantToken,
  type Profile,
  saveBank,
  saveInventory,
  resetPoints,
  updateActiveProfile,
  useActiveProfile,
  useBank,
  useInventory,
  useMoney,
  useOwnedChars,
  useTokens,
} from "@/game/profiles";
import { BASE, type CharAssets, loadSprite, runLoop } from "@/game/render";
import { Screen } from "@/game/screen";
import { Director } from "@/game/story/director";
import { BottomBar, MiniMap, StatusBox, useHudScale, type Vitals } from "@/game/story/hud";
import { RoomScene } from "@/game/story/room-scene";
import type { StoryData } from "@/game/story/types";
import { StartGate } from "@/game/ui";
import { LoadingScreen } from "@/game/kit/loading";
import { z } from "zod";

export const Route = createFileRoute("/play/lobby")({
  beforeLoad: () => {
    if (!getActiveProfile()) throw redirect({ to: "/play/profile" });
  },
  validateSearch: z.object({ map: z.string().optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ map: search.map }),
  loader: async ({ deps }) => {
    const res = await fetch(`${BASE}/stories/${deps.map ?? "lobby"}.json`);
    if (!res.ok) throw new Error("lobby map not exported (bun stories.ts --lobby)");
    return (await res.json()) as StoryData;
  },
  component: Lobby,
  pendingComponent: () => <LoadingScreen show />,
});

/*
  遊戲大廳: the original lobby map (MAP/LOBBY/Newlobby.map, 41 linked rooms) walked with the
  active profile's character, under the client's chat panel. Offline, so the panel's buttons
  act locally: FIGHT opens the mode menu, chara shows the profile, smiley plays the emotes.
*/

const SERVER_NAME: Record<string, string> = {
  tst: "尖沙咀鐘樓",
  coliseum: "紅磡體育館",
  penhotel: "半島酒店",
  space: "太空館",
  museum: "藝術館",
  ifc: "國際金融中心",
  peak: "凌霄閣",
  central: "中環",
  hkbank: "匯豐總行",
  boc: "中銀大廈",
  council: "立法會",
};
type Overlay =
  | "none"
  | "modes"
  | "chara"
  | "skill"
  | "smiley"
  | "system"
  | "keys"
  | "item"
  | "shop"
  | "bank"
  | "smith"
  | "card"
  | "npc";
/** windows that open over the game, leaving the HUD in place */
const FLOATING = new Set<Overlay>(["none", "chara", "skill", "smiley", "item"]);
type Line = { id: number; who: string | null; text: string };
type Say = { id: number; text?: string; smiley?: SmileyDef };

function Lobby() {
  const story = Route.useLoaderData();
  const [started, setStarted] = useState(false);
  const onStart = useCallback(() => {
    audio.music("lfo_lobby.ogg", 0.35);
    setStarted(true);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-foreground select-none">
      <StartGate onStart={onStart} />
      {started && <LobbyRun story={story} profile={getActiveProfile()!} />}
    </div>
  );
}

function LobbyRun({ story, profile }: { story: StoryData; profile: Profile }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const scale = useHudScale();
  // honor changes after VS bouts; the medal follows the save
  const honor = useActiveProfile()?.honor ?? profile.honor ?? 0;
  const host = useRef<HTMLDivElement>(null);
  // the loading screen stays up until the street and the player are in
  const [loading, setLoading] = useState(true);
  const tag = useRef<HTMLDivElement>(null);
  const feet = useRef<HTMLParagraphElement>(null);
  const directorRef = useRef<Director | null>(null);
  const [vitals, setVitals] = useState<Vitals | null>(null);
  // 小地圖: the room you are in, your place in it, and the others in that room
  const [where, setWhere] = useState<{ bg: number; me: number; others: number[] } | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("none");
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  // the street NPC within talking range (npcs.ts), and the one being talked to
  const [near, setNear] = useState<Npc | null>(null);
  const [talking, setTalking] = useState<Npc | null>(null);
  const server = SERVER_NAME[getServer() ?? ""] ?? "LFO";
  const [log, setLog] = useState<Line[]>(() => [
    { id: 1, who: null, text: t`歡迎來到「${server}」伺服器！` },
    { id: 2, who: null, text: t`方向鍵走動，按右下角的戰鬥按鈕開始遊戲。` },
  ]);
  const [say, setSay] = useState<Say | null>(null);

  // 商店: the shop room the player is in, and its shelf for this visit
  const items = useItemTable();
  const { data: shops } = useQuery({
    queryKey: ["game", "shops"],
    queryFn: () =>
      fetch(`${BASE}/shops.json`).then((r) => r.json() as Promise<Record<ShopKind, ShopEntry[]>>),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [shop, setShop] = useState<{ kind: ShopKind; shelf: Shelf } | null>(null);
  const money = useMoney();
  // the newer client folds the chat panel down to its right block; T or ▲ unfolds it
  const [chatMin, setChatMin] = useState(true);
  // the block's corner triangle folds the whole HUD away, leaving only the triangle
  const [hudHidden, setHudHidden] = useState(false);
  // the chara block's windows float over the game with the HUD still up; full menus cover it
  const hudCovered = !FLOATING.has(overlay);
  const live = useActiveProfile();
  const lv = live?.lv ?? profile.lv;
  const exp = live?.exp ?? profile.exp;
  // the dial's clock: time spent in the lobby this visit
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // the backpack as the shop sees it (refreshed whenever the shop opens)
  const bag = useInventory().bag;
  // the counter the player stands at (bank or repair shop) and what it has open
  const [counter, setCounter] = useState<"bank" | "smith" | "card" | null>(null);
  // 卡片店: every card there is (game/cards.ts) and the 信物 the account holds
  const { data: relics } = useQuery({
    queryKey: ["game", "relics"],
    queryFn: () =>
      fetch(`${BASE}/relics.json`).then((r) => (r.ok ? (r.json() as Promise<Relic[]>) : [])),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const tokens = useTokens();
  const ownedChars = useOwnedChars();
  const cards = useMemo(() => {
    const sold = new Set(Object.values(shops ?? {}).flatMap((l) => l.map((e) => e.id)));
    return {
      item: items.size && shops ? itemCards(items, sold) : [],
      // every playable character is on the create screen, so there are no character cards
      char: [],
      relic: (relics ?? []).map((relic): Card => ({ kind: "relic", relic })),
    };
  }, [items, shops, relics]);
  // 銀行: the vault, shared by the server's profiles
  const vault = useBank();
  // 鐵匠 / 神秘人: which of the repair shop's two keepers is serving
  const [smithMode, setSmithMode] = useState<SmithMode>("repair");
  const roomKind = useRef<ReturnType<typeof shopOf>>(null);
  const shopsRef = useRef(shops);
  shopsRef.current = shops;
  const entered = useRef((_bg: number) => {});
  entered.current = (bg) => {
    const kind = shopOf(story.rooms[String(bg)]);
    roomKind.current = kind;
    setCounter(
      kind === "bank" ? "bank" : kind === "repair" ? "smith" : kind === "card" ? "card" : null,
    );
    if (kind === "item" || kind === "weapon" || kind === "armor") {
      const list = shopsRef.current?.[kind] ?? [];
      setShop({ kind, shelf: stock(list) });
      setOverlay("shop");
      audio.sfx("johnnychoose.wav", { volume: 0.6 });
    } else if (kind === "bank") {
      setShop(null);
      setOverlay("bank");
      audio.sfx("johnnychoose.wav", { volume: 0.6 });
    } else if (kind === "repair") {
      // the iron smith greets from his anvil; the 神秘人 further in answers 攻 when you walk up
      setShop(null);
      setSmithMode("repair");
      setOverlay("smith");
      audio.sfx("johnnychoose.wav", { volume: 0.6 });
    } else if (kind === "card") {
      setShop(null);
      setOverlay("card");
      audio.sfx("johnnychoose.wav", { volume: 0.6 });
    } else {
      setShop(null);
      const o = overlayRef.current;
      if (o === "shop" || o === "bank" || o === "smith" || o === "card") setOverlay("none");
    }
  };

  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    let d: Director | null = null;
    const scene = new RoomScene(el, () => ({ x: d?.camera.x ?? 0, height: 600 }));
    const noop = () => {};
    // players arrive on the main street by the Item shop (room 7), not in the park the map's
    // own start point names — the server placed them, not the map file
    const street = story.rooms["7"] ? { ...story, start: { bg: 7, x: 1176, facing: 0 } } : story;
    d = new Director(street, {
      load: (path) => loadSprite(path),
      added: (f, path) => void loadSprite(path).then((a: CharAssets) => scene.add(f, a)),
      removed: (f) => scene.remove(f),
      room: async (room) => scene.setRoom(room),
      entered: (bg) => entered.current(bg),
      preload: (room) => scene.preload(room),
      // doors: push into the doorway under a light veil, then ease back out in the new room
      door: (phase, x, y) =>
        phase === "out" ? scene.zoomTo(x, y, 1.35, 0.55, 220) : scene.zoomTo(x, y, 1, 0, 280),
      talk: async () => {},
      title: noop,
      fade: (_, ms) => new Promise((r) => setTimeout(r, ms)),
      music: noop,
      sound: (f) => audio.sfx(f, { volume: 0.6 }),
      shake: (n) => scene.quake(n),
      status: noop,
      fx: (events) => {
        for (const e of events) if (e.type === "sound") audio.sfx(e.name, { volume: 0.5 });
      },
    });
    const director = d;
    directorRef.current = director;
    director.effects = new Effects(director.world, scene);
    const controls = new Controls();
    if (import.meta.env.DEV) Object.assign(window, { __lfo: { director, scene } });

    let me: Fighter | null = null;
    void director.start().then(async () => {
      me = await director.addPlayer(`chars/${profile.key}`);
      setLoading(false);
    });

    const stop = runLoop(
      director.world,
      () => {
        const input = controls.sample();
        director.step(overlayRef.current === "none" ? input : EMPTY_INPUT);
        if (me && director.world.tick % 10 === 0)
          setNear(npcNear(story.rooms[String(director.bg)], director.roomX(me.x)));
        if (me && director.world.tick % 6 === 0)
          setVitals({
            name: profile.name,
            charId: profile.charId,
            honor: getActiveProfile()?.honor ?? 0,
            hp: me.hp,
            maxHp: me.maxHp,
            mp: me.mp,
            maxMp: me.maxMp,
            sp: 100,
          });
        if (me && director.world.tick % 6 === 0) {
          const width = Number(story.rooms[String(director.bg)]?.width) || 0;
          const player = me;
          setWhere({
            bg: director.bg,
            me: director.roomX(player.x),
            others: director.world.fighters
              .filter((f) => f !== player && f.hp > 0)
              .map((f) => director.roomX(f.x))
              .filter((x) => x >= 0 && x <= width),
          });
        }
      },
      () => {
        director.setViewWidth((el.clientWidth * 600) / Math.max(1, el.clientHeight));
        scene.draw();
        // keep the bubble over the player's head and the name under the feet
        if (me && tag.current) {
          const s = el.clientHeight / 600;
          tag.current.style.transform = `translate(${(me.x - director.camera.x) * s}px, ${(me.z + me.y - 96) * s}px) translate(-50%, -100%)`;
          if (feet.current)
            feet.current.style.transform = `translate(${(me.x - director.camera.x) * s}px, ${(me.z + 6) * s}px) scale(${s}) translate(-50%, 0)`;
        }
      },
    );
    return () => {
      stop();
      controls.dispose();
      scene.destroy();
      audio.music(null);
    };
  }, [story, profile]);

  // bubbles fade after a while
  useEffect(() => {
    if (!say) return;
    const id = setTimeout(() => setSay(null), say.smiley ? 2600 : 4200);
    return () => clearTimeout(id);
  }, [say]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // at the counter: 攻 / Enter opens the shop (or the bank, or whichever keeper is nearer) again
      if ((e.code === "KeyJ" || e.key === "Enter") && overlay === "none" && (shop || counter)) {
        if (e.target instanceof HTMLInputElement) return;
        if (counter === "smith") {
          const d = directorRef.current;
          const room = d && story.rooms[String(d.bg)];
          const near = room && d.player ? nearestKeeper(room, d.player.x) : null;
          setSmithMode(near === "compose" ? "compose" : "repair");
        }
        setOverlay(shop ? "shop" : (counter ?? "none"));
        audio.sfx("johnnychoose.wav", { volume: 0.6 });
        return;
      }
      // a street NPC: a tower guard offers the climb; the reset NPC gives the 能力點 back
      if ((e.code === "KeyJ" || e.key === "Enter") && overlay === "none" && near) {
        if (e.target instanceof HTMLInputElement) return;
        audio.sfx("johnnychoose.wav", { volume: 0.6 });
        if (near.kind === "reset") {
          // 能力重設: every 能力點 back, for a fee (the client's lines, system.tzw 1796 – 1802)
          const r = resetPoints();
          if (r.ok) audio.sfx("johnnyallright.wav");
          toast(`${near.name}：${r.line}`);
        } else {
          setTalking(near);
          setOverlay("npc");
        }
        return;
      }
      if (e.key !== "Escape" || overlay === "keys" || overlay === "modes") return;
      setOverlay((o) => (o === "none" ? "system" : "none"));
      audio.sfx("johnnymove.wav", { volume: 0.5 });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [overlay, shop, counter, story, near, t]);

  const send = (text: string) => {
    const clean = text.trim().slice(0, 60);
    if (!clean) return;
    setLog((l) => [...l.slice(-30), { id: Date.now(), who: profile.name, text: clean }]);
    setSay({ id: Date.now(), text: clean });
  };

  const pickMode = useCallback(
    (m: Mode) => {
      setOverlay("none");
      if (m === "story") void navigate({ to: "/play/story" });
      else if (m === "vs") void navigate({ to: "/play/vs" });
      else if (m === "mission") void navigate({ to: "/play/missions" });
      else if (m === "champion") void navigate({ to: "/play/champion" });
      else if (m === "exit") void navigate({ to: "/" });
    },
    [navigate],
  );

  const toast = (text: string) =>
    setLog((l) => [...l.slice(-30), { id: Date.now(), who: null, text }]);

  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <LoadingScreen show={loading} />

      {/* speech bubble, smileys and the talk prompt above the player */}
      <div
        ref={tag}
        className="pointer-events-none absolute top-0 left-0 z-10 flex origin-top-left flex-col items-center"
      >
        <AnimatePresence>
          {say?.text && <Bubble key={say.id} text={say.text} />}
          {say?.smiley && <Smiley key={say.id} s={say.smiley} />}
        </AnimatePresence>
        <AnimatePresence>
          {near && overlay === "none" && (
            <motion.p
              key={near.name}
              className="mt-1 rounded-[4px] bg-[#1f35b8]/85 px-2 py-0.5 font-bold text-[11px] text-white"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {t`J 與${near.name}對話`}
            </motion.p>
          )}
        </AnimatePresence>
        {/* 勳銜: the rank's medal over the head, as the client draws it (LFO.exe 0x549017) */}
        <div className="-mb-[8px] flex items-center">
          <Ui
            name={`medal/medal0${rankOf(honor) + 1}`}
            w={Math.round(40 * scale)}
            h={Math.round(40 * scale)}
            className="-mx-[10px]"
            alt=""
          />
          <span
            className="font-bold text-[#ffe08a] leading-none [text-shadow:1px_0_0_#000,-1px_0_0_#000,0_1px_0_#000,0_-1px_0_#000]"
            style={{ fontSize: Math.round(12 * scale) }}
          >
            {RANKS[rankOf(honor)]}
          </span>
        </div>
      </div>

      {/* the name under the feet, as the client shows your own in the lobby: magenta, 1 px black outline */}
      <p
        ref={feet}
        className="pointer-events-none absolute top-0 left-0 z-30 origin-top-left font-bold text-[#e64ce6] text-[12px] leading-none whitespace-nowrap [text-shadow:1px_0_0_#000,-1px_0_0_#000,0_1px_0_#000,0_-1px_0_#000]"
      >
        {profile.name}
      </p>

      {vitals && !hudCovered && !hudHidden && <StatusBox v={vitals} scale={scale} />}

      {chatMin && !hudCovered && !hudHidden && where && (
        <MiniMap story={story} bg={where.bg} me={where.me} others={where.others} scale={scale} />
      )}
      {chatMin && !hudCovered && !hudHidden && (
        <BottomBar
          scale={scale}
          seconds={seconds}
          level={lv}
          exp={exp}
          money={money}
          onLogo={() => {
            audio.sfx("johnnymove.wav", { volume: 0.5 });
            setOverlay("system");
          }}
          onItem={() => {
            audio.sfx("johnnymove.wav", { volume: 0.5 });
            setOverlay((o) => (o === "item" ? "none" : "item"));
          }}
        />
      )}

      {hudHidden ? (
        <HudRestore
          scale={scale}
          label={t`展開介面`}
          onClick={() => {
            audio.sfx("johnnymove.wav", { volume: 0.5 });
            setHudHidden(false);
          }}
        />
      ) : (
        <ChatPanel
          scale={scale}
          open={overlay}
          log={log}
          onSend={send}
          minimized={chatMin}
          onToggle={() => {
            audio.sfx("johnnymove.wav", { volume: 0.5 });
            setChatMin((m) => !m);
            // unfolding from T or the button: straight into the chat line
            requestAnimationFrame(() => document.getElementById("lobby-chat")?.focus());
          }}
          onButton={(b) => {
            audio.sfx("johnnymove.wav", { volume: 0.5 });
            if (b === "fight") setOverlay("modes");
            else if (b === "chara" || b === "skill" || b === "smiley")
              setOverlay((o) => (o === b ? "none" : b));
            else if (b === "friend") toast(t`好友名單：單機重現中沒有其他玩家在線。`);
            else if (b === "item") setOverlay((o) => (o === "item" ? "none" : "item"));
            else if (b === "lfo") setOverlay("system");
            else if (b === "min") setHudHidden(true);
          }}
        />
      )}

      <AnimatePresence>
        {overlay === "modes" && (
          <Screen key="modes">
            <ModeMenu onPick={pickMode} />
          </Screen>
        )}
        {overlay === "chara" && (
          <Popup key="chara" onClose={() => setOverlay("none")}>
            <CharaCard onClose={() => setOverlay("none")} />
          </Popup>
        )}
        {overlay === "smiley" && (
          <Popup key="smiley" onClose={() => setOverlay("none")}>
            <SmileyBox
              onPick={(s) => {
                setSay({ id: Date.now(), smiley: s });
                setOverlay("none");
              }}
            />
          </Popup>
        )}
        {overlay === "system" && (
          <SystemMenu
            key="system"
            items={[
              { label: t`返回大廳`, run: () => setOverlay("none") },
              { label: t`按鍵設定`, run: () => setOverlay("keys") },
              { label: t`更換角色`, run: () => void navigate({ to: "/play/profile" }) },
              { label: t`回到標題`, run: () => void navigate({ to: "/" }) },
            ]}
          />
        )}
        {overlay === "keys" && <KeyConfig key="keys" onClose={() => setOverlay("system")} />}
        {overlay === "npc" && talking?.kind === "tower" && (
          <SystemMenu
            key="npc"
            heading={`${talking.name}：${t`要挑戰「${towerName(talking.stage)}」嗎？`}`}
            note={talking.hours ? t`開放時間 ${talking.hours}（離線版不限時）` : undefined}
            items={[
              {
                label: t`挑戰`,
                run: () =>
                  void navigate({ to: "/play/story/$story", params: { story: talking.stage } }),
              },
              { label: t`離開`, run: () => setOverlay("none") },
            ]}
          />
        )}
      </AnimatePresence>
      <FloatingPanel open={overlay === "skill"} scale={Math.min(1.25, scale * 1.1)}>
        <SkillList onClose={() => setOverlay("none")} />
      </FloatingPanel>
      <FloatingPanel open={overlay === "shop" && !!shop} scale={Math.min(1.3, scale * 1.1)}>
        {shop && (
          <ShopBox
            title={{ item: t`道具店`, weapon: t`武器店`, armor: t`防具店` }[shop.kind]}
            shelf={shop.shelf}
            items={items}
            money={money}
            onBuy={(i) => {
              const row = shop.shelf[i];
              const item = row && items.get(row.id);
              if (!item) return t`讀取中…`;
              const r = buy(shop.shelf, i, getInventory(), money, item);
              if (!r.ok) {
                audio.sfx("johnnymove.wav", { volume: 0.4 });
                return r.why;
              }
              audio.sfx("pick.wav", { volume: 0.8 });
              saveInventory(r.inv);
              updateActiveProfile((p) => ({ ...p, money: r.money }));
              setShop({ ...shop, shelf: r.shelf });
              return null;
            }}
            bag={bag}
            onSell={(uid) => {
              const copy = getInventory().bag.find((o) => o.uid === uid);
              const item = copy && items.get(copy.id);
              if (!item) return t`讀取中…`;
              const r = sell(getInventory(), uid, money, item);
              if (!r.ok) {
                audio.sfx("johnnymove.wav", { volume: 0.4 });
                return r.why;
              }
              audio.sfx("pick.wav", { volume: 0.8 });
              saveInventory(r.inv);
              updateActiveProfile((p) => ({ ...p, money: r.money }));
              return null;
            }}
            onClose={() => setOverlay("none")}
          />
        )}
      </FloatingPanel>
      <FloatingPanel open={overlay === "bank"} scale={Math.min(1.2, scale)}>
        <BankBox
          bag={bag}
          bank={vault}
          items={items}
          onDeposit={(uid) => {
            const r = deposit(getInventory(), getBank(), uid);
            if (!r.ok) {
              audio.sfx("johnnymove.wav", { volume: 0.4 });
              return r.why;
            }
            audio.sfx("pick.wav", { volume: 0.8 });
            saveInventory(r.inv);
            saveBank(r.bank);
            return null;
          }}
          onWithdraw={(i) => {
            const r = withdraw(getInventory(), getBank(), i);
            if (!r.ok) {
              audio.sfx("johnnymove.wav", { volume: 0.4 });
              return r.why;
            }
            audio.sfx("pick.wav", { volume: 0.8 });
            saveInventory(r.inv);
            saveBank(r.bank);
            return null;
          }}
          onClose={() => setOverlay("none")}
        />
      </FloatingPanel>
      <FloatingPanel open={overlay === "smith"} scale={Math.min(1.2, scale)}>
        <SmithBox
          key={smithMode}
          mode={smithMode}
          bag={bag}
          items={items}
          money={money}
          onRun={(left, right) => {
            const inv = getInventory();
            const r =
              smithMode === "repair"
                ? repair(inv, left, right, money, items)
                : compose(inv, left, right, items);
            if (!r.ok) {
              audio.sfx("johnnymove.wav", { volume: 0.4 });
              return { ok: false, text: r.why };
            }
            audio.sfx(smithMode === "repair" ? "weaponattack.wav" : "pick.wav", { volume: 0.8 });
            saveInventory(r.inv);
            if (smithMode === "repair") {
              updateActiveProfile((p) => ({ ...p, money: r.money }));
              return { ok: true, text: t`修好了！拿去吧，別再弄壞！` };
            }
            const name = (r.made && items.get(r.made)?.name) ?? "";
            return { ok: true, text: t`合成道具成功！你已取得物品「${name}」。` };
          }}
          onClose={() => setOverlay("none")}
        />
      </FloatingPanel>
      <FloatingPanel open={overlay === "card"} scale={Math.min(1.2, scale)}>
        <CardBox
          cards={cards}
          owned={new Set(tokens)}
          ownedChars={new Set(ownedChars)}
          onEnter={(card) => {
            const r = redeem(card, getInventory(), getTokens(), getOwnedChars());
            if (!r.ok) {
              audio.sfx("johnnymove.wav", { volume: 0.4 });
              return r;
            }
            audio.sfx("pick.wav", { volume: 0.8 });
            if (r.inv) {
              saveInventory(r.inv);
            }
            if (r.token !== undefined) {
              grantToken(r.token);
            }
            if (r.char) grantChar(r.char);
            return r;
          }}
          onClose={() => setOverlay("none")}
        />
      </FloatingPanel>
      <FloatingPanel open={overlay === "item"} scale={Math.min(1.2, scale)}>
        <Backpack onClose={() => setOverlay("none")} />
      </FloatingPanel>
    </>
  );
}

/* ───────── chat panel (kit/chat: the chatpanel/* chrome redrawn) ───────── */

type PanelButton = PanelTab | "lfo" | "item";

function ChatPanel({
  scale,
  log,
  onSend,
  onButton,
  open,
  minimized,
  onToggle,
}: {
  scale: number;
  log: Line[];
  onSend: (t: string) => void;
  onButton: (b: PanelButton) => void;
  open: Overlay;
  /** folded down to its right block (chatpanelmin), as the newer client shows the lobby */
  minimized: boolean;
  onToggle: () => void;
}) {
  const { t } = useLingui();
  const [text, setText] = useState("");
  const logEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // (scrollIntoView returns a Promise in newer browsers; an effect must not return it)
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [log]);

  const labels = {
    chara: t`角色資料`,
    skill: t`技能`,
    friend: t`好友`,
    smiley: t`表情`,
    fight: t`戰鬥：選擇遊戲模式`,
    chat: t`聊天`,
    min: t`收起介面`,
  };
  // the disc's chat crescent folds / unfolds this panel; the rest goes to the lobby
  const pick = (b: PanelTab) => (b === "chat" ? onToggle() : onButton(b));
  if (minimized)
    return (
      // the chara block stands on the bottom strip, right above its Item plate
      <div
        className="absolute right-0 bottom-0 z-20 h-[102px] w-[114px]"
        style={{
          transform: `translateY(${-33 * scale}px) scale(${scale})`,
          transformOrigin: "bottom right",
        }}
      >
        <TabBlock open={open} onPick={pick} labels={labels} />
        <FocusChatOnT onOpen={onToggle} />
      </div>
    );

  return (
    <div
      className="absolute bottom-0 left-1/2 z-20 h-[175px] w-[800px]"
      style={{ transform: `translateX(-50%) scale(${scale})`, transformOrigin: "bottom center" }}
    >
      <ChatBody />
      <div className="absolute -top-[14px] left-[40px] flex gap-1">
        <ChannelTab channel="public" active />
        <ChannelTab channel="room" />
      </div>
      {/* the plates' flat right ends sit flush with the screen edge: LFO above the panel, Item in its notch */}
      <div className="absolute -top-[38px] left-[701px]">
        <PlateButton plate="lfo" onClick={() => onButton("lfo")} aria-label={t`系統選單`} />
      </div>
      <div className="absolute top-[134px] left-[701px]">
        <PlateButton plate="item" onClick={() => onButton("item")} aria-label={t`背包`} />
      </div>

      {/* log */}
      <div className="absolute top-[24px] left-[44px] h-[88px] w-[570px] overflow-y-auto pr-2 text-[13px] leading-[1.5] [scrollbar-width:none]">
        {log.map((l) => (
          <p key={l.id} className={l.who ? "text-white" : "text-[#ffe27a]"}>
            {l.who ? <span className="font-bold text-[#9fd0ff]">{l.who}：</span> : "【系統】"}
            {l.text}
          </p>
        ))}
        <div ref={logEnd} />
      </div>

      {/* input + send */}
      <form
        className="absolute top-[130px] left-[52px] flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSend(text);
          setText("");
          (document.activeElement as HTMLElement | null)?.blur();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t`按 T 輸入訊息…`}
          aria-label={t`聊天`}
          className="h-[28px] w-[540px] bg-transparent text-[14px] text-white outline-none placeholder:text-white/50"
          onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
          id="lobby-chat"
        />
        <SendButton type="submit" aria-label={t`傳送`} />
      </form>
      <FocusChatOnT />

      {/* right block: tabs + FIGHT, and the button that folds the panel back down */}
      <div className="absolute top-[22px] left-[686px]">
        <TabBlock open={open} onPick={pick} labels={labels} />
      </div>
    </div>
  );
}

/** T focuses the chat line — and first unfolds the panel when it is folded down. */
function FocusChatOnT({ onOpen }: { onOpen?: () => void }) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.code !== "KeyT" || e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    if (onOpen) onOpen();
    else document.getElementById("lobby-chat")?.focus();
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, []);
  return null;
}

/* ───────── overlays ───────── */

function SystemMenu({
  items,
  heading,
  note,
}: {
  items: { label: string; run: () => void }[];
  heading?: string;
  note?: string;
}) {
  const [sel, setSel] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") setSel((s) => (s + 1) % items.length);
      else if (e.key === "ArrowUp") setSel((s) => (s - 1 + items.length) % items.length);
      else if (e.key === "Enter" || e.code === "KeyJ") items[sel].run();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [items, sel]);
  return (
    <motion.div
      className="absolute inset-0 z-40 grid place-items-center bg-black/55"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <ul className="flex flex-col items-center gap-2">
        {heading && (
          <li className="mb-2 max-w-[420px] text-center">
            <p className="font-bold text-[16px] text-white [text-shadow:0_1px_2px_#000]">
              {heading}
            </p>
            {note && <p className="mt-1 text-[12px] text-[#ffe08a]">{note}</p>}
          </li>
        )}
        {items.map((it, i) => (
          <li key={it.label}>
            <MetalButton active={i === sel} onMouseEnter={() => setSel(i)} onClick={it.run}>
              {it.label}
            </MetalButton>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/* ───────── over-the-head bubbles ───────── */

function Bubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
    >
      <SpeechBubble text={text} />
    </motion.div>
  );
}

const TOWERS: Record<string, string> = {
  tower01: "人類之塔",
  tower02: "魔族之塔",
  tower03: "聖賢之塔",
};
const towerName = (stage: string) => TOWERS[stage] ?? stage;
