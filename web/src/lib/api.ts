import { queryOptions } from "@tanstack/react-query";
import { ASSETS } from "@/lib/assets";

/* Types mirror api/openapi/openapi.yaml. */

export type Stats = { hp: number; mp: number; sp: number; str: number; def: number; agi: number };
export type CharRef = { id: number; name: string; head: string | null; color: string | null };

export type CharacterRow = {
  id: number;
  name: string;
  name_en: string;
  base_id: number | null;
  head: string | null;
  portrait: string | null;
  color: string | null;
  skill_count: number;
};

export type Skill = {
  id: number;
  char_id: number;
  slot: number;
  name: string;
  tier: number;
  mp: number;
  keys: string[];
  chain: number;
  ultimate: number;
  icon: string | null;
};
export type SkillRow = Skill & {
  char_name: string;
  char_head: string | null;
  char_color: string | null;
};

export type Character = CharacterRow & {
  hp: number;
  mp: number;
  walk: number;
  run: number;
  jump_h: number;
  jump_d: number;
  weight: number;
  stats_default: Stats;
  stats_growth: Stats;
  stats_max: Stats;
  weapon_skill: Record<string, number>;
  faces: string[];
  skills: Skill[];
  forms: CharRef[];
  prev: CharRef | null;
  next: CharRef | null;
};

export type ItemKind = "equipment" | "item";
export type ItemRow = {
  id: number;
  name: string;
  category: string;
  /** equipment slot: 0 accessory, 1 head, 3 held, 4 body, 5 shield, 6 hands, 7 shoes, 8 ring; 9+ not worn */
  part: number;
  /** .spt type: 100 weapon … 500 potion … 2000+ equipment */
  type: number;
  req_lv: number;
  /** stats needed to wear it */
  req: Stats;
  mods: Stats;
  mod_total: number;
  durability: number;
  /** what it is mended with: item 2900 + n (0 布料 … 8 魔精石); -1 cannot be repaired */
  material: number;
  price: number;
  /** character ids that may use it; empty = anyone */
  users: number[];
  icon: string | null;
  color: string | null;
};
export type Item = Omit<ItemRow, "users"> & {
  description: string | null;
  kind: ItemKind;
  users: CharRef[];
};

export type SearchHit = {
  kind: "character" | "equipment" | "item" | "skill";
  id: number;
  name: string;
  meta: string;
  image: string | null;
  color: string | null;
  owner?: number;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The data is read-only, so the deployed site has no API server: api/cmd/export
 * (`make snapshot`) writes every response to data/assets/api/v1, served with the
 * other assets. Same mapping as the exporter: "/items?kind=item" -> "items/kind/item.json".
 */
export function staticUrl(path: string) {
  const [route, query] = path.split("?");
  const params = [...new URLSearchParams(query)].map(([k, v]) => `/${k}/${v}`).join("");
  return `${ASSETS}/api/v1${route}${params}.json`;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(staticUrl(path), { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(res.status, body?.error?.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

/** Image paths from the API are relative to /assets. */
export const asset = (p: string | null | undefined) => (p ? `${ASSETS}/${p}` : undefined);

// The data is rebuilt offline and never changes while the app runs.
const forever = { staleTime: Number.POSITIVE_INFINITY, gcTime: 30 * 60_000 };

export const q = {
  stats: () =>
    queryOptions({
      queryKey: ["stats"],
      queryFn: ({ signal }) => get<{ kind: string; n: number }[]>("/stats", signal),
      ...forever,
    }),
  characters: () =>
    queryOptions({
      queryKey: ["characters"],
      queryFn: ({ signal }) => get<CharacterRow[]>("/characters", signal),
      ...forever,
    }),
  character: (id: number) =>
    queryOptions({
      queryKey: ["character", id],
      queryFn: ({ signal }) => get<Character>(`/characters/${id}`, signal),
      ...forever,
    }),
  skills: () =>
    queryOptions({
      queryKey: ["skills"],
      queryFn: ({ signal }) => get<SkillRow[]>("/skills", signal),
      ...forever,
    }),
  items: (kind: ItemKind) =>
    queryOptions({
      queryKey: ["items", kind],
      queryFn: ({ signal }) => get<ItemRow[]>(`/items?kind=${kind}`, signal),
      ...forever,
    }),
  item: (id: number) =>
    queryOptions({
      queryKey: ["item", id],
      queryFn: ({ signal }) => get<Item>(`/items/${id}`, signal),
      ...forever,
    }),
  search: (term: string) =>
    queryOptions({
      queryKey: ["search", term],
      queryFn: ({ signal }) => get<SearchHit[]>(`/search?q=${encodeURIComponent(term)}`, signal),
      enabled: term.length > 0,
      staleTime: 60_000,
    }),
};
