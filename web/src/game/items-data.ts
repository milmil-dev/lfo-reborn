import { useQuery } from "@tanstack/react-query";
import { type ItemRow, q } from "@/lib/api";

/** Every item in the game (equipment and the rest), by id. */
export function useItemTable(): Map<number, ItemRow> {
  const { data: equipment = [] } = useQuery(q.items("equipment"));
  const { data: rest = [] } = useQuery(q.items("item"));
  return new Map([...equipment, ...rest].map((i) => [i.id, i]));
}
