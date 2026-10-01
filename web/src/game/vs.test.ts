import {
  canLaunch,
  decided,
  engineTeam,
  type Guest,
  rankOf,
  seatCount,
  settleHonor,
  stepLevel,
} from "./vs";

describe("VS", () => {
  it("seats the players at this machine beside the COMs, four fighters at most", () => {
    const room = { stage: "vs_school", name: "x", team: 1, coms: [] };
    const guest = (team: number): Guest => ({ key: "davis", team, lv: 1, device: "kb2" });
    const com = { key: "davis", team: 2, lv: 1 };
    expect(canLaunch({ ...room, guests: [guest(1)] })).toBe(false);
    expect(canLaunch({ ...room, guests: [guest(2)] })).toBe(true);
    expect(seatCount({ ...room, guests: [guest(2)], coms: [com] })).toBe(3);
    expect(canLaunch({ ...room, guests: [guest(2), guest(2), guest(2)], coms: [com] })).toBe(false);
  });

  it("steps a level along the COM ladder and holds at the ends", () => {
    expect(stepLevel(1, 1)).toBe(10);
    expect(stepLevel(10, -1)).toBe(1);
    expect(stepLevel(45, 1)).toBe(60);
    expect(stepLevel(45, -1)).toBe(30);
    expect(stepLevel(150, 1)).toBe(150);
    expect(stepLevel(1, -1)).toBe(1);
  });

  it("gives 獨立 fighters a side each", () => {
    expect(engineTeam(0, 0)).not.toBe(engineTeam(0, 1));
    expect(engineTeam(2, 0)).toBe(engineTeam(2, 3));
  });

  it("needs two sides to launch", () => {
    const room = { stage: "vs_school", name: "x", team: 1, coms: [] };
    expect(canLaunch(room)).toBe(false);
    expect(canLaunch({ ...room, coms: [{ key: "davis", team: 1, lv: 1 }] })).toBe(false);
    expect(canLaunch({ ...room, coms: [{ key: "davis", team: 2, lv: 1 }] })).toBe(true);
    expect(canLaunch({ ...room, team: 0, coms: [{ key: "davis", team: 0, lv: 1 }] })).toBe(true);
  });

  it("is decided when one team is left", () => {
    expect(
      decided([
        { team: 1, hp: 5 },
        { team: 2, hp: 3 },
      ]),
    ).toBeNull();
    expect(
      decided([
        { team: 1, hp: 5 },
        { team: 2, hp: 0 },
      ]),
    ).toBe(1);
    expect(
      decided([
        { team: 1, hp: 0 },
        { team: 2, hp: 0 },
      ]),
    ).toBe(-1);
  });

  it("ranks honor and says so when the rank moves", () => {
    expect(rankOf(0)).toBe(0);
    expect(rankOf(260)).toBe(3);
    const up = settleHonor(25, true, 1);
    expect(up.honor).toBe(40);
    expect(up.line).toBe("恭喜！您的勳銜從「嘍囉」升級到「初心者」了！");
    const down = settleHonor(32, false, 0);
    expect(down.line).toBe("您的勳銜從「初心者」降至「嘍囉」。");
    expect(settleHonor(0, false, 0).honor).toBe(0);
  });
});
