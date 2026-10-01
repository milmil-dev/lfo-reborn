import { useQuery } from "@tanstack/react-query";
import { audio } from "@/game/audio";
import { statsAt, statTable } from "@/game/leveling";
import { q } from "@/lib/api";
import { useItemTable } from "@/game/items-data";
import { saveInventory, useActiveProfile, useInventory } from "@/game/profiles";
import { EquipBox } from "./equip-box";

/** 背包 / 裝備 of the active profile, saved as it changes (the Item plate opens it). */
export function Backpack({ onClose }: { onClose: () => void }) {
  const items = useItemTable();
  const inv = useInventory();
  const profile = useActiveProfile();
  const { data } = useQuery({ ...q.character(profile?.charId ?? 0), enabled: !!profile });
  if (!profile) return null;
  // equipment asks for stats: the character's own at this level with its 能力點 (worn gear aside)
  const stats = data ? statsAt(statTable(data), profile.lv, profile.points) : undefined;
  return (
    <EquipBox
      inv={inv}
      items={items}
      lv={profile.lv}
      charId={profile.charId}
      stats={stats}
      onChange={(next) => {
        audio.sfx("pick.wav", { volume: 0.6 });
        saveInventory(next);
      }}
      onClose={onClose}
    />
  );
}
