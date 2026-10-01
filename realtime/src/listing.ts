import type { RoomSummary } from "../../web/src/game/net/protocol";

/** an entry this old is checked against its room before it is listed (directory.ts) */
export const STALE_MS = 10 * 60_000;

/** Rooms still waiting first, each group newest first. */
export function listing(entries: Iterable<RoomSummary>): RoomSummary[] {
  return [...entries].sort(
    (a, b) =>
      Number(a.phase === "fight") - Number(b.phase === "fight") || b.updatedAt - a.updatedAt,
  );
}
