import { nameProblem } from "./names";

describe("character names", () => {
  it("follows the client's rules", () => {
    expect(nameProblem("星仔", [])).toBeNull();
    expect(nameProblem("Stinky 2", [])).toBeNull();
    expect(nameProblem("  ", [])).toBe("請輸入角色名字");
    expect(nameProblem("星仔!", [])).toBe("角色名字不能含有附號");
    expect(nameProblem("星仔", ["星仔", null])).toBe("角式名稱已被使用。");
    expect(nameProblem("stinky", ["Stinky"])).toBe("角式名稱已被使用。");
  });
});
