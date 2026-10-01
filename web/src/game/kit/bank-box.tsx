import { useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { BANK_SIZE } from "@/game/bank";
import type { Owned } from "@/game/inventory";
import type { ItemRow } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ChestBag, COLS, ItemCell, ItemTip, ROWS } from "./chest-bag";
import { Ui } from "./ui";

/*
  銀行 as the client lays it out: the backpack chest beside the vault (bank/bank_box, 239 × 472,
  5 × 10 cells of 39.4 px from (20.4, 54.8)). A click moves an item across; the chest sits 24 px
  lower so both grids share their rows.
*/

const BANK = { x: 226, gx: 20.4, gy: 54.8, cell: 39.4 };

export function BankBox({
  bag,
  bank,
  items,
  onDeposit,
  onWithdraw,
  onClose,
}: {
  bag: Owned[];
  bank: Owned[];
  items: Map<number, ItemRow>;
  /** move a backpack copy (by uid) into the bank; returns why it failed, or null */
  onDeposit: (uid: number) => string | null;
  /** move bank item i into the backpack; returns why it failed, or null */
  onWithdraw: (i: number) => string | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const [hover, setHover] = useState<{ copy: Owned; k: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const shown = hover && items.get(hover.copy.id);
  const at = (k: number) => ({
    left: BANK.x + BANK.gx + (k % COLS) * BANK.cell,
    top: BANK.gy + Math.floor(k / COLS) * BANK.cell,
  });

  return (
    <div className="relative h-[492px] w-[465px] select-none">
      <ChestBag
        bag={bag}
        items={items}
        x={0}
        y={24}
        onPick={(copy) => setNote(onDeposit(copy.uid))}
        onClose={onClose}
      />
      <div onPointerLeave={() => setHover(null)}>
        <Ui name="bank/bank_box" w={239} h={472} className="absolute" style={{ left: BANK.x }} />
        <p className="absolute top-[22px] left-[330px] font-lfo text-[9px] text-[#1450d8]">
          {bank.length}/{BANK_SIZE}
        </p>
        {Array.from({ length: COLS * ROWS }, (_, k) => (
          <ItemCell
            key={k}
            copy={bank[k]}
            item={bank[k] && items.get(bank[k].id)}
            {...at(k)}
            size={BANK.cell}
            onHover={() => bank[k] && setHover({ copy: bank[k], k })}
            onPick={() => {
              setHover(null);
              setNote(onWithdraw(k));
            }}
          />
        ))}
        {hover && shown && (
          <ItemTip
            copy={hover.copy}
            item={shown}
            x={at(hover.k).left + BANK.cell / 2}
            y={at(hover.k).top}
          />
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute h-[14px] w-[24px] rounded-[2px] hover:bg-white/30"
          style={{ left: BANK.x + 206, top: 17 }}
          aria-label={t`關閉`}
        />
      </div>

      <p
        className={cn(
          "absolute top-[474px] left-[4px] text-[12px] [text-shadow:0_1px_1px_#000]",
          note ? "text-[#ffb0b0]" : "text-white/75",
        )}
      >
        {note ?? t`點擊背包物品存入銀行，點擊銀行物品取回`}
      </p>
    </div>
  );
}
