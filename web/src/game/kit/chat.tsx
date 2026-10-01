import { type ButtonHTMLAttributes, useState } from "react";
import { cn } from "@/lib/cn";
import { Ui } from "./ui";

/*
  The lobby chat panel from the client's HD art (chatpanel/*): the 800 × 175 body, the
  right-hand tab block (chara / skill / friend / smiley + the FIGHT disc) with its hover and
  active overlays, the LFO / Item plates, send and the channel tabs.
*/

const C = "chatpanel/chatpanel";

export function ChatBody() {
  return <Ui name={`${C}body`} w={800} h={175} className="absolute inset-0" />;
}

export type PanelTab = "chara" | "skill" | "friend" | "smiley" | "fight" | "chat" | "min";

// hit areas on the 114 × 102 tab block, measured from chatpanelrightbody
const HITS: Record<PanelTab, [number, number, number, number]> = {
  chara: [46, 4, 50, 20],
  skill: [40, 26, 46, 20],
  friend: [30, 48, 48, 20],
  smiley: [14, 70, 60, 20],
  // the disc: its left crescent opens the chat panel, the rest is FIGHT
  chat: [68, 50, 18, 30],
  fight: [86, 36, 22, 44],
  // the corner triangle folds the HUD away
  min: [92, 80, 16, 16],
};
// overlay art per state: [hover, active]
const STATES: Record<PanelTab, [string, string]> = {
  chara: [`${C}chara1`, `${C}chara2`],
  skill: [`${C}skill1`, `${C}skill2`],
  friend: [`${C}friend1`, `${C}friend2`],
  smiley: [`${C}smiley2`, `${C}smiley2`],
  fight: [`${C}fight2`, `${C}fight2`],
  chat: [`${C}chat`, `${C}chat2`],
  min: [`${C}min`, `${C}minb2`],
};

/** The tab block + FIGHT disc (chatpanelrightbody, 114 × 102). */
export function TabBlock({
  open,
  onPick,
  labels,
}: {
  open: string;
  onPick: (t: PanelTab) => void;
  labels: Record<PanelTab, string>;
}) {
  const [hover, setHover] = useState<PanelTab | null>(null);
  return (
    <div className="relative h-[102px] w-[114px]">
      <Ui name={`${C}rightbody`} w={114} h={102} className="absolute inset-0" />
      <Ui name={`${C}fight`} w={114} h={102} className="absolute inset-0" />
      {(Object.keys(HITS) as PanelTab[]).map((t) =>
        hover === t || open === t ? (
          <Ui
            key={t}
            name={STATES[t][open === t ? 1 : 0]}
            w={114}
            h={102}
            className="absolute inset-0"
          />
        ) : null,
      )}
      {(Object.keys(HITS) as PanelTab[]).map((t) => {
        const [x, y, w, h] = HITS[t];
        return (
          <button
            key={t}
            type="button"
            aria-label={labels[t]}
            aria-pressed={open === t}
            onMouseEnter={() => setHover(t)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onPick(t)}
            className="absolute"
            style={{ left: x, top: y, width: w, height: h }}
          />
        );
      })}
    </div>
  );
}

/** LFO / Item plates (chatpanellfo, chatpanelitem*, 99 × 35). */
export function PlateButton({
  plate,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { plate: "lfo" | "item" }) {
  const [hover, setHover] = useState(false);
  const skin = plate === "lfo" ? `${C}lfo` : `${C}item${hover ? "1" : ""}`;
  return (
    <button
      type="button"
      {...props}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn("relative h-[35px] w-[99px] transition hover:brightness-110", className)}
    >
      <Ui name={skin} w={99} h={35} />
    </button>
  );
}

export function ChannelTab({ channel, active }: { channel: "public" | "room"; active?: boolean }) {
  return <Ui name={`${C}${channel}${active ? 2 : 1}`} w={99} h={16} alt={channel} />;
}

export function SendButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hover, setHover] = useState(false);
  return (
    <button
      {...props}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative h-[31px] w-[72px]"
    >
      <Ui name={`${C}${hover ? "sendup" : "send"}`} w={72} h={31} />
    </button>
  );
}

/**
 * With the HUD folded away (the block's corner triangle) only the triangle stays in the corner,
 * drawn where it sits on the block (chatpanelmin / minb2); pressing it brings the HUD back.
 */
export function HudRestore({
  onClick,
  scale,
  label,
}: {
  onClick: () => void;
  scale: number;
  label: string;
}) {
  const [hover, setHover] = useState(false);
  const [x, y, w, h] = HITS.min;
  return (
    <div
      className="pointer-events-none absolute right-0 bottom-0 z-20 h-[102px] w-[114px]"
      style={{ transform: `scale(${scale})`, transformOrigin: "bottom right" }}
    >
      <Ui name={`${C}${hover ? "minb2" : "min"}`} w={114} h={102} className="absolute inset-0" />
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="pointer-events-auto absolute"
        style={{ left: x, top: y, width: w, height: h }}
      />
    </div>
  );
}
