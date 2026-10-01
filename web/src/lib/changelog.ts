/*
  更新內容: the repo's CHANGELOG.md (release-please writes a section per release from the
  Conventional Commit titles), inlined by vite.config.ts as __CHANGELOG__ and parsed here.

    ## [0.2.0](…/compare/v0.1.0...v0.2.0) (2026-10-08)
    ### Features
    * **web:** show the release notes ([#4](…)) ([1a2b3c4](…))
*/

export type ChangeItem = { scope: string | null; text: string; commit: string | null };
export type ChangeSection = { kind: string; items: ChangeItem[] };
export type Release = { version: string; date: string | null; sections: ChangeSection[] };

/** `[label](url)` → label */
const unlink = (s: string) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

export function parseChangelog(md: string): Release[] {
  const releases: Release[] = [];
  let section: ChangeSection | null = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^##\s+\[?([\d.]+[^\]\s]*)\]?(?:\([^)]*\))?\s*(?:\((\d{4}-\d{2}-\d{2})\))?/.exec(
      line,
    );
    if (head) {
      releases.push({ version: head[1], date: head[2] ?? null, sections: [] });
      section = null;
      continue;
    }
    const release = releases.at(-1);
    if (!release) continue;
    const sub = /^###\s+(.+)$/.exec(line);
    if (sub) {
      section = { kind: sub[1].trim(), items: [] };
      release.sections.push(section);
      continue;
    }
    const item = /^[*-]\s+(.+)$/.exec(line);
    if (item && section) {
      let text = item[1];
      // the trailing ([sha](url)) is the commit; a ([#n](url)) before it is the PR
      const commit = /\(\[([0-9a-f]{7,40})\]\([^)]*\)\)\s*$/.exec(text);
      if (commit) text = text.slice(0, commit.index).trim();
      text = unlink(text)
        .replace(/\s*\(#\d+\)\s*$/, "")
        .trim();
      const scoped = /^\*\*([^*]+):\*\*\s*(.+)$/.exec(text);
      section.items.push({
        scope: scoped ? scoped[1] : null,
        text: scoped ? scoped[2] : text,
        commit: commit ? commit[1].slice(0, 7) : null,
      });
    }
  }
  return releases.filter((r) => r.sections.some((s) => s.items.length));
}

/** The release sections players care about first, in this order; the rest follow as written. */
export const SECTION_ORDER = ["Features", "Bug Fixes", "Performance Improvements"];
