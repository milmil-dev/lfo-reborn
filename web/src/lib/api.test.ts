import { describe, expect, it } from "vite-plus/test";
import { staticUrl } from "./api";

// Must match staticPath in api/cmd/export/main.go.
describe("staticUrl", () => {
  it("maps a list endpoint to a .json file", () => {
    expect(staticUrl("/characters")).toBe("/assets/api/v1/characters.json");
  });

  it("maps an id to a file in the list's folder", () => {
    expect(staticUrl("/characters/42")).toBe("/assets/api/v1/characters/42.json");
  });

  it("turns query parameters into path segments", () => {
    expect(staticUrl("/items?kind=equipment")).toBe("/assets/api/v1/items/kind/equipment.json");
  });
});
