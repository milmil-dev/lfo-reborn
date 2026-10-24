import { useLingui } from "@lingui/react/macro";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { audio } from "../audio";
import { Pill } from "../kit/room";
import { Ui } from "../kit/ui";
import { useActiveProfile } from "../profiles";
import { catalogQuery } from "../stage-select";
import { listRooms, newRoomCode } from "./client";
import { MAX_ROOM_NAME, MAX_SEATS, type RoomSummary } from "./protocol";

/*
  選擇遊戲室 — the client's room list (selectroom/): the header bar (tophead · topmiddle × 3 ·
  toptail), the table (middletabletop, a middletablemiddle per row, middletablebottom, the
  highlight on the chosen row), and along the bottom the room-code box (bottomroomsearch), the
  chosen room's name (bottomroomselected) and the red buttons. Rows show every listed room:
  name, host, seats (the joingamelv bars), stage, level, and whether it is still waiting.
*/

const TABLE_X = 50;
const TABLE_Y = 130;
const ROWS = 8;
const ROW_H = 39;
/** the table's cell edges (middletablemiddle), from its left edge */
const COLS = [8, 188, 332, 391, 515, 589, 649, 697];
const POLL_MS = 4000;

type Col = { x: number; w: number; align?: "center" };
const col = (i: number, align?: "center"): Col => ({
  x: COLS[i],
  w: COLS[i + 1] - COLS[i],
  align,
});
const CELL = {
  name: col(0),
  host: col(1),
  seats: col(2, "center"),
  stage: col(3),
  level: col(4, "center"),
  phase: col(5, "center"),
  bars: col(6, "center"),
};

function Cell({
  c,
  className,
  children,
}: {
  c: Col;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "absolute inset-y-0 flex items-center truncate px-[6px] font-bold text-[12px]",
        c.align === "center" && "justify-center",
        className,
      )}
      style={{ left: c.x, width: c.w }}
    >
      {children}
    </span>
  );
}

/** A red selectroom button with its label drawn live. */
function RedButton({
  wide,
  label,
  onClick,
  disabled,
}: {
  wide?: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const w = wide ? 134 : 87;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "relative grid h-[34px] place-items-center",
        disabled && "opacity-40 grayscale",
      )}
      style={{ width: w }}
    >
      <Ui
        name={`selectroom/bottombutton${(wide ? 2 : 0) + (hover && !disabled ? 1 : 0)}`}
        w={w}
        h={34}
        className="absolute inset-0"
      />
      <span className="relative font-bold text-[13px] text-white [text-shadow:0_1px_2px_#000]">
        {label}
      </span>
    </button>
  );
}

export function RoomList({
  base,
  onJoin,
  onCreate,
  onBack,
}: {
  base: string;
  onJoin: (code: string) => void;
  /** a fresh code from the Worker, and the name and listing the host chose for it */
  onCreate: (code: string, name: string, listed: boolean) => void;
  onBack: () => void;
}) {
  const { t } = useLingui();
  const profile = useActiveProfile();
  const { data: catalog } = useSuspenseQuery(catalogQuery);
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [listed, setListed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);

  // the list is a poll: a room changes a few times a minute, and a sleeping directory costs nothing
  useEffect(() => {
    let alive = true;
    const pull = () =>
      listRooms(base)
        .then((r) => {
          if (!alive) return;
          setRooms(r);
          setFailed(false);
        })
        .catch(() => alive && setFailed(true));
    void pull();
    const id = setInterval(pull, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [base]);

  const stageTitle = (key: string) => catalog.find((e) => e.key === key)?.title ?? key;
  const all = rooms ?? [];
  const pages = Math.max(1, Math.ceil(all.length / ROWS));
  const shown = all.slice(page * ROWS, page * ROWS + ROWS);
  const chosen = all.find((r) => r.code === picked) ?? null;
  const joinable = (r: RoomSummary) => r.phase === "lobby" && r.seats < MAX_SEATS;
  /** Why 加入 is off for the chosen room — a bout in progress cannot take a new fighter. */
  const blocked = chosen
    ? chosen.phase === "fight"
      ? t`「${chosen.name}」正在對戰中，要等這一局結束才能加入。`
      : chosen.seats >= MAX_SEATS
        ? t`「${chosen.name}」已經滿了（${chosen.seats}/${MAX_SEATS}）。`
        : null
    : null;

  const join = (c: string) => {
    audio.sfx("johnnyconfirm.wav");
    onJoin(c.trim().toUpperCase());
  };
  const create = async () => {
    setBusy(true);
    try {
      audio.sfx("johnnyconfirm.wav");
      onCreate(await newRoomCode(base), name.trim(), listed);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  const headerText = [t`遊戲室`, t`主持`, t`人數`, t`場地`, "LV", t`狀態`];
  // the header pieces carry a knob at each join (x ≈ 69, 230, 391, 552): titles step past them
  const headerCols: Col[] = [
    CELL.name,
    CELL.host,
    CELL.seats,
    { x: CELL.stage.x + 22, w: CELL.stage.w - 22 },
    { x: CELL.level.x + 48, w: CELL.level.w - 48 },
    CELL.phase,
  ];

  return (
    <>
      <Ui name="newgame/backg2" w={800} h={600} className="absolute inset-0 opacity-60" />
      <div className="absolute top-[22px] left-[50px] w-[700px]">
        <p className="font-black text-[24px] text-white italic [text-shadow:0_2px_0_#000]">
          {t`選擇遊戲室`}
        </p>
        <p className="mt-1 font-bold text-[13px] text-[#ffe08a] [text-shadow:0_1px_2px_#000]">
          {failed
            ? t`連接不到對戰伺服器。`
            : rooms === null
              ? t`讀取中…`
              : blocked
                ? blocked
                : t`${all.length} 間公開的遊戲室。點一間再按「加入」，或輸入朋友的房號。`}
        </p>
      </div>

      {/* header bar */}
      <div className="absolute flex" style={{ left: TABLE_X, top: TABLE_Y - 38 }}>
        <Ui name="selectroom/tophead" w={59} h={37} />
        <Ui name="selectroom/topmiddle0" w={161} h={37} />
        <Ui name="selectroom/topmiddle0" w={161} h={37} />
        <Ui name="selectroom/topmiddle0" w={161} h={37} />
        <Ui name="selectroom/toptail0" w={160} h={37} />
        {headerText.map((h, i) => (
          <Cell key={h} c={headerCols[i]} className="text-white [text-shadow:0_1px_1px_#000]">
            {h}
          </Cell>
        ))}
      </div>

      {/* the table */}
      <div className="absolute" style={{ left: TABLE_X, top: TABLE_Y }}>
        <Ui name="selectroom/middletabletop" w={701} h={26} />
        {Array.from({ length: ROWS }, (_, i) => {
          const r = shown[i];
          return (
            <div key={r?.code ?? `empty-${i}`} className="relative h-[39px] w-[701px]">
              <Ui
                name="selectroom/middletablemiddle"
                w={701}
                h={ROW_H}
                className="absolute inset-0"
              />
              {r && picked === r.code && (
                <Ui
                  name="selectroom/middletablehl"
                  w={690}
                  h={33}
                  className="absolute top-[3px] left-[5px] opacity-70"
                />
              )}
              {r ? (
                <button
                  type="button"
                  className="absolute inset-0 text-left text-[#1b1f2a]"
                  onClick={() => {
                    audio.sfx("johnnymove.wav", { volume: 0.5 });
                    setPicked(r.code);
                  }}
                  onDoubleClick={() => joinable(r) && join(r.code)}
                  aria-label={r.name}
                >
                  <Cell c={CELL.name}>{r.name}</Cell>
                  <Cell c={CELL.host}>{r.host}</Cell>
                  <Cell c={CELL.seats}>
                    {r.seats}/{MAX_SEATS}
                  </Cell>
                  <Cell c={CELL.stage}>{stageTitle(r.stage)}</Cell>
                  <Cell c={CELL.level}>{r.level}</Cell>
                  <Cell
                    c={CELL.phase}
                    className={r.phase === "fight" ? "text-[#b4232a]" : "text-[#1d6f2f]"}
                  >
                    {r.phase === "fight" ? t`進行中` : r.seats >= MAX_SEATS ? t`已滿` : t`等候中`}
                  </Cell>
                  <Cell c={CELL.bars}>
                    <Ui
                      name={`selectroom/joingamelv${Math.min(4, Math.max(1, r.seats))}`}
                      w={[10, 25, 42, 63][Math.min(4, Math.max(1, r.seats)) - 1]}
                      h={15}
                    />
                  </Cell>
                </button>
              ) : (
                i === 0 &&
                rooms !== null &&
                !all.length && (
                  <Cell c={{ x: 8, w: 689 }} className="text-[#5b616b]">
                    {t`暫時沒有公開的遊戲室 — 開一間吧！`}
                  </Cell>
                )
              )}
            </div>
          );
        })}
        <Ui name="selectroom/middletablebottom" w={701} h={39} />
        {pages > 1 && (
          <div className="absolute top-[2px] right-[-30px] flex flex-col gap-1">
            <Pill
              className="px-2 py-0 text-[11px]"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              ▲
            </Pill>
            <Pill
              className="px-2 py-0 text-[11px]"
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            >
              ▼
            </Pill>
          </div>
        )}
      </div>

      {/* room code, the chosen room, and the buttons */}
      <div className="absolute flex items-end gap-[10px]" style={{ left: TABLE_X, top: 508 }}>
        <div className="relative h-[61px] w-[186px]">
          <Ui name="selectroom/bottomroomsearch0" w={186} h={61} className="absolute inset-0" />
          <span className="absolute top-[7px] left-[14px] font-bold text-[11px] text-white">{t`房號`}</span>
          <input
            type="text"
            value={code}
            maxLength={8}
            spellCheck={false}
            placeholder="ABCD"
            aria-label={t`房號`}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && code.trim().length >= 4 && join(code)}
            className="absolute top-[31px] left-[12px] h-[23px] w-[162px] bg-transparent text-center font-lfo text-[14px] text-[#1b1f2a] tracking-[0.3em] outline-none placeholder:text-[#9aa0aa]"
          />
        </div>
        <div className="relative h-[55px] w-[195px]">
          <Ui name="selectroom/bottomroomselected" w={195} h={55} className="absolute inset-0" />
          <span className="absolute top-[24px] right-[16px] left-[16px] truncate text-center font-bold text-[12px] text-[#1b1f2a]">
            {chosen ? chosen.name : code.trim().length >= 4 ? code.trim() : t`（未選擇）`}
          </span>
        </div>
        <div className="mb-[10px] flex gap-[8px]">
          <RedButton
            label={t`加入`}
            onClick={() => (chosen ? join(chosen.code) : join(code))}
            disabled={chosen ? !joinable(chosen) : code.trim().length < 4}
          />
          <RedButton
            wide
            label={t`建立遊戲室`}
            onClick={() => {
              audio.sfx("johnnychoose.wav");
              setName(t`${profile?.name ?? "LFO"}的遊戲室`);
              setCreating(true);
            }}
          />
          <RedButton label={t`返回`} onClick={onBack} />
        </div>
      </div>

      {creating && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/60">
          <div className="w-[360px] rounded-[14px] border-2 border-white/30 bg-[#161a24]/95 p-6 text-white shadow-2xl">
            <p className="font-black text-[18px] italic">{t`建立遊戲室`}</p>
            <label className="mt-4 block text-[12px] text-white/70">
              {t`遊戲室名稱`}
              <input
                type="text"
                value={name}
                maxLength={MAX_ROOM_NAME}
                autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !busy && void create()}
                className="mt-1 block h-[34px] w-full rounded border border-white/30 bg-black/40 px-3 text-[14px] text-white outline-none focus:border-[#ffd27a]"
              />
            </label>
            <button
              type="button"
              onClick={() => setListed((v) => !v)}
              className="mt-3 flex items-center gap-2 text-[12px] text-white/80"
            >
              <span
                className={cn(
                  "grid size-4 place-items-center rounded border border-white/50",
                  listed && "bg-[#ffd27a] text-black",
                )}
              >
                {listed ? "✓" : ""}
              </span>
              {t`公開在遊戲室列表（否則只有知道房號的人能加入）`}
            </button>
            <div className="mt-5 flex justify-end gap-3">
              <Pill dim onClick={() => setCreating(false)} disabled={busy}>
                {t`取消`}
              </Pill>
              <Pill onClick={() => void create()} disabled={busy}>
                {busy ? t`建立中…` : t`建立`}
              </Pill>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
