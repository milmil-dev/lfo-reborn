# Content Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix missing sections, correct Chinese names, and batch-migrate all ~625 HTML pages from the original LFO site to MDX.

**Architecture:** A Python migration script reads HTML files from `~/Downloads/lfostory-original/index2/`, strips Google Sites boilerplate, extracts text content, and writes MDX files with frontmatter. Section metadata is updated to list all migrated pages.

**Tech Stack:** Python 3 (html.parser), Bun, Fumadocs MDX

---

## Chunk 1: Fix Section Issues

### Task 1: Add Missing `system` Section

**Files:**
- Create: `content/docs/system/index.mdx`
- Create: `content/docs/system/meta.json`
- Modify: `content/docs/meta.json`

- [ ] **Step 1: Create system section**

```bash
mkdir -p content/docs/system
```

Create `content/docs/system/index.mdx`:
```mdx
---
title: 系統說明
description: LFO遊戲系統說明
---

# 系統說明

系統說明頁面正在遷移中...
```

Create `content/docs/system/meta.json`:
```json
{
	"pages": ["---"]
}
```

- [ ] **Step 2: Add system to root meta.json sidebar ordering**

In `content/docs/meta.json`, add `"system"` after `"good"` in the pages array.

- [ ] **Step 3: Commit**

```bash
git add content/docs/system/ content/docs/meta.json
git commit -m "feat: add missing system (系統說明) section"
```

### Task 2: Correct Chinese Section Names

**Files:**
- Modify: `content/docs/camp/index.mdx` — 營地 → 終極拳皇盃
- Modify: `content/docs/good/index.mdx` — 精品 → 產品資訊
- Modify: `content/docs/photo/index.mdx` — 圖片 → 圖片展覽
- Modify: `content/docs/dex/index.mdx` — 圖鑑 → 技能圖鑑
- Modify: `content/docs/towers/index.mdx` — 塔 → 死亡之塔
- Modify: `content/docs/bgm/index.mdx` — 音樂 → 音樂庭院
- Modify: `content/docs/fans/index.mdx` — 同人 → 同人故事
- Modify: `content/docs/beast/index.mdx` — 獸 → 兇獸檔案
- Modify: `content/docs/start/index.mdx` — 新手 → 最初的LFO
- Modify: `content/docs/hkacg/index.mdx` — HKACG → 動漫電玩節
- Modify: `content/docs/agsogs/index.mdx` — AG/SOG → 亞洲遊戲展
- Modify: `content/docs/sitemaster/index.mdx` — 站長 → 館主的話
- Modify: `content/docs/fanscamp/index.mdx` — 同人營 → 蕃薯集中營
- Modify: `content/docs/items/index.mdx` — 道具 → 道具圖鑑
- Modify: `content/docs/missionindex/index.mdx` — 任務 → 任務連載
- Modify: `content/docs/storyindex/index.mdx` — 故事 → 故事連載
- Modify: `content/docs/character/index.mdx` — 角色 → 角色資料
- Modify: `content/docs/update/index.mdx` — 更新 → 更新日誌

Correct name mapping (from original site navigation):

| Section | Correct Chinese Name |
|---------|---------------------|
| character | 角色資料 |
| storyindex | 故事連載 |
| missionindex | 任務連載 |
| dex | 技能圖鑑 |
| items | 道具圖鑑 |
| towers | 死亡之塔 |
| camp | 終極拳皇盃 |
| start | 最初的LFO |
| fanscamp | 蕃薯集中營 |
| fans | 同人故事 |
| photo | 圖片展覽 |
| bgm | 音樂庭院 |
| hkacg | 動漫電玩節 |
| agsogs | 亞洲遊戲展 |
| beast | 兇獸檔案 |
| good | 產品資訊 |
| update | 更新日誌 |
| sitemaster | 館主的話 |
| system | 系統說明 |

- [ ] **Step 1: Update all index.mdx titles and descriptions**

For each section, update the `title` in frontmatter and the `# heading` to match the correct Chinese name above.

- [ ] **Step 2: Update landing page category grid**

In `app/(home)/page.tsx`, update the `categories` array to use the correct Chinese names.

- [ ] **Step 3: Update docs index navigation**

In `content/docs/index.mdx`, update the navigation links to use correct Chinese names.

- [ ] **Step 4: Commit**

```bash
git add content/docs/ app/
git commit -m "fix: correct all Chinese section names to match original site"
```

---

## Chunk 2: Build Migration Script

### Task 3: Create HTML-to-MDX Migration Script

**Files:**
- Create: `scripts/migrate.py`

- [ ] **Step 1: Create migration script**

Create `scripts/migrate.py`:

```python
#!/usr/bin/env python3
"""Migrate LFO original site HTML pages to MDX format."""

import os
import re
import json
from html.parser import HTMLParser
from pathlib import Path

SOURCE_DIR = Path.home() / "Downloads" / "lfostory-original" / "index2"
TARGET_DIR = Path(__file__).parent.parent / "content" / "docs"

# Section name mapping
SECTION_NAMES = {
    "character": "角色資料",
    "storyindex": "故事連載",
    "missionindex": "任務連載",
    "dex": "技能圖鑑",
    "items": "道具圖鑑",
    "towers": "死亡之塔",
    "camp": "終極拳皇盃",
    "start": "最初的LFO",
    "fanscamp": "蕃薯集中營",
    "fans": "同人故事",
    "photo": "圖片展覽",
    "bgm": "音樂庭院",
    "hkacg": "動漫電玩節",
    "agsogs": "亞洲遊戲展",
    "beast": "兇獸檔案",
    "good": "產品資訊",
    "update": "更新日誌",
    "sitemaster": "館主的話",
    "system": "系統說明",
}

# Footer markers - content after these is boilerplate
FOOTER_MARKERS = [
    "目前的網站版本為",
    "★本網站創辦者為",
    "Powered By",
    "Google Sites",
]


class ContentExtractor(HTMLParser):
    """Extract meaningful text content from Google Sites HTML."""

    def __init__(self):
        super().__init__()
        self.sections = []
        self.current_text = []
        self.skip = False
        self.in_table = 0
        self.table_rows = []
        self.current_row = []
        self.current_cell = []
        self.in_cell = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skip = True
        elif tag == "table":
            self.in_table += 1
            if self.in_table == 1:
                self.table_rows = []
        elif tag == "tr" and self.in_table:
            self.current_row = []
        elif tag in ("td", "th") and self.in_table:
            self.current_cell = []
            self.in_cell = True
        elif tag == "br":
            if self.in_cell:
                self.current_cell.append("\n")
            else:
                self.current_text.append("\n")
        elif tag in ("h1", "h2", "h3", "h4"):
            self.current_text.append(f"\n{'#' * int(tag[1])} ")
        elif tag == "li":
            self.current_text.append("\n- ")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.skip = False
        elif tag == "table":
            self.in_table -= 1
            if self.in_table == 0 and self.table_rows:
                self.flush_table()
        elif tag == "tr" and self.in_table:
            if self.current_row:
                self.table_rows.append(self.current_row)
        elif tag in ("td", "th") and self.in_table:
            self.in_cell = False
            cell_text = " ".join(
                t.strip() for t in self.current_cell if t.strip()
            ).strip()
            self.current_row.append(cell_text)
        elif tag == "p":
            self.current_text.append("\n\n")
        elif tag in ("h1", "h2", "h3", "h4"):
            self.current_text.append("\n\n")

    def handle_data(self, data):
        if self.skip:
            return
        text = data.strip()
        if not text:
            return
        if self.in_cell:
            self.current_cell.append(text)
        else:
            self.current_text.append(text + " ")

    def flush_table(self):
        """Convert accumulated table rows to markdown table."""
        if not self.table_rows:
            return
        # Filter out empty rows
        rows = [r for r in self.table_rows if any(cell.strip() for cell in r)]
        if not rows:
            return
        # Normalize column count
        max_cols = max(len(r) for r in rows)
        rows = [r + [""] * (max_cols - len(r)) for r in rows]

        self.current_text.append("\n\n")
        # Header
        self.current_text.append("| " + " | ".join(rows[0]) + " |\n")
        self.current_text.append("|" + "|".join(["------"] * max_cols) + "|\n")
        # Data rows
        for row in rows[1:]:
            self.current_text.append("| " + " | ".join(row) + " |\n")
        self.current_text.append("\n")
        self.table_rows = []

    def get_content(self):
        text = "".join(self.current_text)
        # Remove footer boilerplate
        for marker in FOOTER_MARKERS:
            idx = text.find(marker)
            if idx > 0:
                text = text[:idx]
                break
        # Clean up whitespace
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r" {2,}", " ", text)
        return text.strip()


def extract_title_from_html(filepath):
    """Try to get a meaningful title from the HTML file."""
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    # Try <title> tag first
    match = re.search(r"<title>([^<]+)</title>", content)
    if match:
        title = match.group(1)
        # Remove " - LFO資料博物館" suffix
        title = re.sub(r"\s*-\s*LFO資料博物館$", "", title)
        if title:
            return title
    return None


def convert_html_to_mdx(html_path, section, slug):
    """Convert a single HTML file to MDX content."""
    with open(html_path, "r", encoding="utf-8", errors="replace") as f:
        html_content = f.read()

    title = extract_title_from_html(html_path) or slug.replace("-", " ").title()
    section_name = SECTION_NAMES.get(section, section)

    extractor = ContentExtractor()
    extractor.feed(html_content)
    content = extractor.get_content()

    # Remove the breadcrumb navigation at the top (e.g., "博物館大廳 > 角色資料")
    content = re.sub(r"^.*?博物館大廳.*?\n", "", content)
    # Remove page heading if it duplicates the title
    content = re.sub(rf"^#+ {re.escape(title)}\s*\n", "", content)

    mdx = f"""---
title: "{title}"
description: "{section_name} - {title}"
---

# {title}

{content}
"""
    return mdx


def migrate_section(section):
    """Migrate all HTML pages in a section."""
    source_dir = SOURCE_DIR / section
    target_dir = TARGET_DIR / section

    if not source_dir.exists():
        print(f"  Skipping {section}: source dir not found")
        return []

    html_files = sorted(source_dir.glob("*.html"))
    # Filter out junk files
    html_files = [
        f
        for f in html_files
        if "JOT_GA" not in f.name and "Shift" not in f.name
    ]

    if not html_files:
        print(f"  Skipping {section}: no HTML files")
        return []

    target_dir.mkdir(parents=True, exist_ok=True)
    migrated = []

    for html_file in html_files:
        slug = html_file.stem
        # Skip the section index page (we already have index.mdx)
        if slug == section:
            # But extract content for the index page
            mdx_content = convert_html_to_mdx(html_file, section, slug)
            index_path = target_dir / "index.mdx"
            with open(index_path, "w", encoding="utf-8") as f:
                f.write(mdx_content)
            print(f"  Updated index: {section}/index.mdx")
            continue

        mdx_content = convert_html_to_mdx(html_file, section, slug)
        mdx_path = target_dir / f"{slug}.mdx"
        with open(mdx_path, "w", encoding="utf-8") as f:
            f.write(mdx_content)
        migrated.append(slug)
        print(f"  Migrated: {section}/{slug}.mdx")

    # Also process subdirectories (e.g., photo/player)
    for subdir in sorted(source_dir.iterdir()):
        if subdir.is_dir() and "Shift" not in subdir.name:
            sub_html_files = sorted(subdir.glob("*.html"))
            sub_html_files = [
                f
                for f in sub_html_files
                if "JOT_GA" not in f.name and "Shift" not in f.name
            ]
            sub_target = target_dir / subdir.name
            sub_target.mkdir(parents=True, exist_ok=True)

            for html_file in sub_html_files:
                slug = html_file.stem
                mdx_content = convert_html_to_mdx(
                    html_file, section, f"{subdir.name}/{slug}"
                )
                mdx_path = sub_target / f"{slug}.mdx"
                with open(mdx_path, "w", encoding="utf-8") as f:
                    f.write(mdx_content)
                print(f"  Migrated: {section}/{subdir.name}/{slug}.mdx")

    # Update meta.json with migrated page slugs
    if migrated:
        meta_path = target_dir / "meta.json"
        meta = {"pages": migrated + ["---"]}
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent="\t")
            f.write("\n")
        print(f"  Updated meta.json: {len(migrated)} pages")

    return migrated


def main():
    sections = list(SECTION_NAMES.keys())
    total = 0
    for section in sections:
        print(f"\nMigrating {section} ({SECTION_NAMES[section]})...")
        migrated = migrate_section(section)
        total += len(migrated)

    print(f"\n✓ Migration complete: {total} pages migrated")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Test the script on one section**

```bash
python3 scripts/migrate.py 2>&1 | head -30
```

Expected: Script runs and outputs migrated file names.

- [ ] **Step 3: Verify a migrated page renders**

```bash
bun run dev
```

Check a few pages in the browser to ensure content renders correctly.

- [ ] **Step 4: Run Biome format on migrated content**

```bash
bun run lint:fix
```

- [ ] **Step 5: Commit all migrated content**

```bash
git add content/docs/ scripts/
git commit -m "feat: batch-migrate all content from original LFO site

Migrated ~625 HTML pages across 19 sections using scripts/migrate.py"
```

---

## Chunk 3: Build Verification

### Task 4: Verify Build and Content

- [ ] **Step 1: Run production build**

```bash
bun run build
```

Expected: Build succeeds with all pages generated.

- [ ] **Step 2: Spot-check content quality**

Open dev server and check:
- `/docs/character` — character index has content
- `/docs/storyindex` — story pages list correctly
- `/docs/dex` — skill pages render
- `/docs/items` — item data tables work
- Sidebar shows all sections with correct Chinese names

- [ ] **Step 3: Fix any build or content issues**

If build fails or content is malformed, fix and re-run.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve any migration content issues"
```
