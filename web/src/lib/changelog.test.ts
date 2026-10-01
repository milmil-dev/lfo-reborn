import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseChangelog } from "./changelog";

const MD = `# Changelog

## [0.2.0](https://github.com/milmil-dev/lfo-reborn/compare/v0.1.0...v0.2.0) (2026-10-08)


### Features

* **game:** 防 spends SP ([#4](https://github.com/milmil-dev/lfo-reborn/issues/4)) ([1a2b3c4](https://github.com/milmil-dev/lfo-reborn/commit/1a2b3c4d))
* show the release notes ([9f8e7d6](https://github.com/milmil-dev/lfo-reborn/commit/9f8e7d6))


### Bug Fixes

* **web:** centre the clock on the lens ([abcdef0](https://github.com/milmil-dev/lfo-reborn/commit/abcdef0))

## 0.1.0 (2026-10-01)

### Features

* first release
`;

describe("changelog", () => {
  it("reads release-please's sections, scopes and commits", () => {
    const r = parseChangelog(MD);
    expect(r.map((x) => [x.version, x.date])).toEqual([
      ["0.2.0", "2026-10-08"],
      ["0.1.0", "2026-10-01"],
    ]);
    expect(r[0].sections.map((s) => s.kind)).toEqual(["Features", "Bug Fixes"]);
    expect(r[0].sections[0].items).toEqual([
      { scope: "game", text: "防 spends SP", commit: "1a2b3c4" },
      { scope: null, text: "show the release notes", commit: "9f8e7d6" },
    ]);
    expect(r[1].sections[0].items[0]).toEqual({ scope: null, text: "first release", commit: null });
  });

  it("parses the repo's own CHANGELOG.md", () => {
    const md = readFileSync(resolve(process.cwd(), "../CHANGELOG.md"), "utf8");
    const r = parseChangelog(md);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].sections.every((s) => s.items.length > 0)).toBe(true);
  });

  it("an empty file has no releases", () => {
    expect(parseChangelog("")).toEqual([]);
  });
});
