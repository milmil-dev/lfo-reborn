import { useLingui } from "@lingui/react/macro";
import { ASSETS } from "@/lib/assets";
import { cn } from "@/lib/cn";
import { Ui } from "./ui";

/*
  The waiting room's pieces (waitplayer/): a line-up row (players / computerslot / addcom,
  433 × 33), a character's head (waitsprite<id>), the team badge, the ◀ ▶ and ▲ ▼ arrows. Shared
  by the local room (/play/room) and the online one (/play/online).
*/

export const ROW_X = 24;
export const ROW_Y = 150;
export const ROW_STEP = 46;
export const TEAM_COLOR = ["#9aa0aa", "#e5484d", "#3e8ef7", "#3fbf6b", "#f2c230"];

export function Head({ id }: { id: number }) {
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

export function TeamBadge({ team, onClick }: { team: number; onClick?: () => void }) {
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

export function Row({
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

/** A small pill on a row: the device a seat reads, who hosts, 準備 …; clickable when `onClick`. */
export function Tag({
  onClick,
  tone = "gold",
  children,
}: {
  onClick?: () => void;
  tone?: "gold" | "green" | "dim";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "shrink-0 rounded-full bg-black/40 px-[7px] py-px font-lfo text-[9px] whitespace-nowrap",
        tone === "gold" && "text-[#ffe08a]",
        tone === "green" && "text-[#9be38a]",
        tone === "dim" && "text-white/50",
        onClick && "hover:bg-black/60",
      )}
    >
      {children}
    </button>
  );
}

export function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/30 px-1 font-lfo text-[9px] text-white/60">
      {children}
    </kbd>
  );
}

export function Arrow({ dir, onClick }: { dir: "l" | "r"; onClick: () => void }) {
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

export function LevelArrows({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
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

/** The room chat panel on the right (chat_area), with the lines and an optional input. */
export function ChatPanel({
  lines,
  onSend,
}: {
  lines: { who: string | null; text: string }[];
  onSend?: (text: string) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="absolute top-[4px] left-[488px] h-[592px] w-[305px]">
      <Ui name="waitplayer/chat_area" w={305} h={592} className="absolute inset-0" />
      <div className="absolute top-[10px] bottom-[52px] left-[12px] w-[281px] space-y-[6px] overflow-hidden text-[12px]">
        {lines.slice(-28).map((l, i) => (
          <p key={`${i}-${l.text}`} className="text-[#ffe9a8]">
            <span className="text-[#ffb27a]">{l.who === null ? t`【系統】` : `${l.who}：`}</span>
            {l.text}
          </p>
        ))}
      </div>
      {onSend && (
        <input
          type="text"
          maxLength={120}
          placeholder={t`輸入訊息，Enter 送出`}
          className="absolute bottom-[14px] left-[12px] h-[26px] w-[281px] rounded border border-white/20 bg-black/40 px-2 text-[12px] text-white outline-none placeholder:text-white/30 focus:border-[#ffd27a]"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const el = e.currentTarget;
            if (el.value.trim()) onSend(el.value);
            el.value = "";
          }}
        />
      )}
    </div>
  );
}
