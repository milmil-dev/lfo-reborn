import { Fragment, type ReactNode } from "react";
import { Ui } from "./kit/ui";
import { RANKS, rankOf } from "./vs";

/*
  Profile / server panels: the client's HD art (profile/databright · datadim · nodata,
  profile/select_border, server/bar) with live values laid over the printed labels.
*/

export type PanelData = {
  name: string;
  lv: number;
  hp: number;
  mp: number;
  sp: number;
  str: number;
  def: number;
  agi: number;
  exp: number;
  money: number;
  honor: number;
  head?: string;
  /** when the character was made (ms), shown under the name as the newer client does */
  created?: number;
};

/** "Sun Oct 19 18:28:23 2025", the newer client's way of writing the date. */
export function clientDate(ms: number) {
  const d = new Date(ms);
  const [wd, mon, day, year] = d.toDateString().split(" ");
  const t = [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return `${wd} ${mon} ${day} ${t} ${year}`;
}

/*
  The profile card, built from elements in the look of the client's profile/databright: a white
  rounded outline on the red, a faint grid of rounded squares at both ends, and the values set
  beside their labels (the art had the labels baked in, which made the values impossible to line
  up — so the whole card is laid out here instead).
*/

/** A faint 4 × 5 grid of rounded squares, the card's end decoration. */
function SquareGrid({ className }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute grid grid-cols-4 gap-[6px] ${className ?? ""}`}
      aria-hidden
    >
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i} className="size-[26px] rounded-[7px] bg-white/[0.13]" />
      ))}
    </div>
  );
}

const label = "font-lfo text-white leading-none";
const num = "font-lfo tabular-nums text-white leading-none";

/** A profile slot (605 × 176): the character's card, or NO DATA. */
export function DataPanel({ data, bright }: { data: PanelData | null; bright?: boolean }) {
  const rank = data ? rankOf(data.honor) : 0;
  return (
    <div
      className={`relative h-[176px] w-[605px] rounded-[34px] border-[5px] transition-colors ${
        bright ? "border-white" : "border-white/60"
      }`}
      role="img"
      aria-label={data?.name ?? "NO DATA"}
    >
      <SquareGrid className="top-[9px] left-[14px]" />
      <SquareGrid className="top-[9px] right-[14px]" />
      {!data ? (
        <p
          className={`${label} absolute inset-0 grid place-items-center text-[54px] text-white/85`}
        >
          NO DATA
        </p>
      ) : (
        <div className={bright ? "" : "opacity-70"}>
          {/* who: PLAYER: name, and when they were made */}
          <div className="absolute top-[20px] left-[28px] flex items-baseline gap-[10px]">
            <span className={`${label} text-[19px]`}>PLAYER:</span>
            <span className="max-w-[160px] truncate font-bold text-[19px] text-white leading-none">
              {data.name}
            </span>
          </div>
          {data.created !== undefined && (
            <p
              className={`${num} absolute top-[47px] left-[30px] text-[11px] text-white/85 tracking-[0.04em]`}
            >
              {clientDate(data.created)}
            </p>
          )}

          {/* the six stats in two columns, each value right beside its label */}
          <div className="absolute top-[78px] left-[30px] grid grid-cols-[34px_50px_16px_40px_40px] gap-y-[7px] items-baseline">
            {(
              [
                ["HP", data.hp, "STR", data.str],
                ["MP", data.mp, "DEF", data.def],
                ["SP", data.sp, "AGI", data.agi],
              ] as const
            ).map(([a, av, b, bv]) => (
              <Fragment key={a}>
                <span className={`${label} text-[15px]`}>{a}</span>
                <span className={`${num} text-right text-[14px]`}>{av}</span>
                <span />
                <span className={`${label} text-[15px]`}>{b}</span>
                <span className={`${num} text-right text-[14px]`}>{bv}</span>
              </Fragment>
            ))}
          </div>

          {/* the arrow disc and the small target, the card's printed ornaments */}
          <span className="absolute top-[22px] left-[238px] grid size-[36px] place-items-center rounded-full border-[3px] border-white/90">
            <span className="grid size-[24px] place-items-center rounded-full bg-white/90 text-[#d81200]">
              <svg viewBox="0 0 16 16" className="size-[14px]" aria-hidden>
                <path
                  d="M3 8h8M8 4l4 4-4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
          <span className="absolute top-[98px] left-[246px] grid size-[20px] place-items-center rounded-full border-[3px] border-white/80">
            <span className="size-[6px] rounded-full bg-white/80" />
          </span>

          {/* EXP / MONEY / HONOR between brackets */}
          <div className="absolute top-[76px] left-[278px] h-[66px] w-[164px] rounded-[12px] border-x-[3px] border-white/90 px-[12px] py-[6px]">
            {(
              [
                ["EXP:", data.exp.toLocaleString()],
                ["MONEY:", data.money.toLocaleString()],
                ["HONOR:", data.honor.toLocaleString()],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex h-[18px] items-center justify-between">
                <span className={`${label} text-[11px]`}>{k}</span>
                <span className={`${num} text-[12px]`}>{v}</span>
              </div>
            ))}
          </div>
          {/* 勳銜 beside the box: the medal of the rank the honor has reached */}
          <div className="absolute top-[82px] left-[446px] flex w-[48px] flex-col items-center">
            <Ui name={`medal/medal0${rank + 1}`} w={40} h={40} className="-my-[8px]" />
            <span className="mt-[4px] font-bold text-[10px] text-white leading-none">
              {RANKS[rank]}
            </span>
          </div>

          {/* LV top right, the face under it */}
          <div className="absolute top-[18px] right-[32px] flex items-baseline gap-[6px]">
            <span className={`${label} text-[20px]`}>LV.</span>
            <span className={`${num} text-[28px]`}>{data.lv}</span>
          </div>
          {data.head && (
            <div className="absolute top-[56px] right-[32px] size-[72px] overflow-hidden rounded-[12px] border-[3px] border-white bg-black/20">
              <img
                src={data.head}
                alt=""
                className="size-full object-cover object-top"
                draggable={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The chosen card's PROFILE tabs, top and bottom, carrying the slot number (605 × 206). */
export function ProfileFrame({ n }: { n: number }) {
  const tab = (
    <span className="flex h-[30px] w-[214px] items-center justify-center gap-[10px] rounded-full border-[5px] border-white bg-[#d81200]">
      <span className={`${label} text-[15px] tracking-[0.12em]`}>PROFILE</span>
      <span className={`${num} text-[15px] text-white/70`}>{String(n).padStart(2, "0")}</span>
    </span>
  );
  return (
    <div className="pointer-events-none relative flex h-[206px] w-[605px] flex-col items-center justify-between">
      {tab}
      {tab}
    </div>
  );
}

/** SERVER SELECT bar (644 × 209); children sit in its window. */
export function ServerBar({ children }: { children?: ReactNode }) {
  return (
    <div className="relative h-[209px] w-[644px]">
      <Ui name="server/bar" w={644} h={209} className="absolute inset-0" />
      <div className="absolute inset-x-[160px] top-[40px] bottom-[14px]">{children}</div>
    </div>
  );
}
