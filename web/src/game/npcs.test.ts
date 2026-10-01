import { npcNear } from "./npcs";
import type { Room } from "./story/types";

const room = {
  layers: [
    { img: "npc_tower1_zaba.spt", x: 1202 },
    { img: "street_2_02.png", x: 1100 },
  ],
} as Room;

describe("street NPCs", () => {
  it("answers when the player stands close", () => {
    expect(npcNear(room, 1150)).toMatchObject({ kind: "tower", stage: "tower01" });
    expect(npcNear(room, 800)).toBeNull();
    expect(npcNear(undefined, 0)).toBeNull();
  });
});
