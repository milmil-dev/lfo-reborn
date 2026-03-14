#!/usr/bin/env python3
"""Migrate LFO original site HTML pages to MDX format."""

import json
import os
import re
from html.parser import HTMLParser
from pathlib import Path

SOURCE_DIR = Path.home() / "Downloads" / "lfostory-original" / "index2"
TARGET_DIR = Path(__file__).parent.parent / "content" / "docs"

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

FOOTER_MARKERS = [
    "目前的網站版本為",
    "★本網站創辦者為",
    "Powered By",
]

SKIP_PATTERNS = ["JOT_GA", "Shift +"]


class ContentExtractor(HTMLParser):
    """Extract meaningful text content from Google Sites HTML."""

    def __init__(self):
        super().__init__()
        self.parts = []
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
                self.current_cell.append(" ")
            else:
                self.parts.append("\n")
        elif tag in ("h1", "h2", "h3", "h4"):
            level = int(tag[1])
            self.parts.append(f"\n\n{'#' * level} ")
        elif tag == "li":
            self.parts.append("\n- ")
        elif tag == "p":
            self.parts.append("\n\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.skip = False
        elif tag == "table":
            self.in_table -= 1
            if self.in_table == 0 and self.table_rows:
                self._flush_table()
        elif tag == "tr" and self.in_table:
            if self.current_row:
                self.table_rows.append(self.current_row)
        elif tag in ("td", "th") and self.in_table:
            self.in_cell = False
            cell = " ".join(t.strip() for t in self.current_cell if t.strip()).strip()
            self.current_row.append(cell)
        elif tag in ("h1", "h2", "h3", "h4"):
            self.parts.append("\n\n")

    def handle_data(self, data):
        if self.skip:
            return
        text = data.strip()
        if not text:
            return
        if self.in_cell:
            self.current_cell.append(text)
        else:
            self.parts.append(text + " ")

    def _flush_table(self):
        rows = [r for r in self.table_rows if any(c.strip() for c in r)]
        if not rows:
            self.table_rows = []
            return
        max_cols = max(len(r) for r in rows)
        rows = [r + [""] * (max_cols - len(r)) for r in rows]
        # Escape pipe chars in cells
        for i, row in enumerate(rows):
            rows[i] = [c.replace("|", "\\|") for c in row]

        self.parts.append("\n\n")
        self.parts.append("| " + " | ".join(rows[0]) + " |\n")
        self.parts.append("|" + "|".join(["------"] * max_cols) + "|\n")
        for row in rows[1:]:
            self.parts.append("| " + " | ".join(row) + " |\n")
        self.parts.append("\n")
        self.table_rows = []

    def get_content(self):
        text = "".join(self.parts)
        for marker in FOOTER_MARKERS:
            idx = text.find(marker)
            if idx > 0:
                text = text[:idx]
                break
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r" {2,}", " ", text)
        # Escape ALL angle brackets and curly braces for MDX safety
        text = text.replace("<", "&lt;").replace(">", "&gt;")
        text = text.replace("{", "\\{").replace("}", "\\}")
        return text.strip()


def extract_title(filepath):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()
    match = re.search(r"<title>([^<]+)</title>", content)
    if match:
        title = match.group(1).strip()
        title = re.sub(r"\s*-\s*LFO資料博物館$", "", title)
        if title:
            return title
    return None


def should_skip(path):
    name = str(path)
    return any(p in name for p in SKIP_PATTERNS)


def convert_html(html_path, section, slug):
    with open(html_path, "r", encoding="utf-8", errors="replace") as f:
        html = f.read()

    title = extract_title(html_path) or slug
    section_name = SECTION_NAMES.get(section, section)

    extractor = ContentExtractor()
    extractor.feed(html)
    content = extractor.get_content()

    # Strip breadcrumb nav
    content = re.sub(r"^.*?博物館大廳[^\n]*\n*", "", content)
    # Strip duplicate heading
    escaped = re.escape(title)
    content = re.sub(rf"^\s*#+ {escaped}\s*\n*", "", content)

    # Escape MDX-problematic chars in frontmatter title
    safe_title = title.replace('"', '\\"')

    return f'---\ntitle: "{safe_title}"\ndescription: "{section_name} - {safe_title}"\n---\n\n# {title}\n\n{content}\n'


def migrate_section(section):
    source_dir = SOURCE_DIR / section
    target_dir = TARGET_DIR / section

    if not source_dir.exists():
        print(f"  Skip {section}: not found")
        return []

    # Collect HTML files (top level)
    html_files = sorted(f for f in source_dir.glob("*.html") if not should_skip(f))
    if not html_files:
        print(f"  Skip {section}: no HTML files")
        return []

    target_dir.mkdir(parents=True, exist_ok=True)
    migrated = []

    for html_file in html_files:
        slug = html_file.stem

        if slug == section:
            # Update the index page with real content
            mdx = convert_html(html_file, section, slug)
            (target_dir / "index.mdx").write_text(mdx, encoding="utf-8")
            print(f"  ✓ index: {section}/index.mdx")
            continue

        mdx = convert_html(html_file, section, slug)
        (target_dir / f"{slug}.mdx").write_text(mdx, encoding="utf-8")
        migrated.append(slug)

    # Process subdirectories
    for subdir in sorted(source_dir.iterdir()):
        if not subdir.is_dir() or should_skip(subdir):
            continue
        sub_files = sorted(f for f in subdir.glob("*.html") if not should_skip(f))
        if not sub_files:
            continue

        sub_target = target_dir / subdir.name
        sub_target.mkdir(parents=True, exist_ok=True)

        sub_slugs = []
        for html_file in sub_files:
            slug = html_file.stem
            mdx = convert_html(html_file, f"{section}/{subdir.name}", slug)
            (sub_target / f"{slug}.mdx").write_text(mdx, encoding="utf-8")
            sub_slugs.append(slug)

        # Write sub-section meta
        if sub_slugs:
            meta = {"pages": sub_slugs}
            (sub_target / "meta.json").write_text(
                json.dumps(meta, ensure_ascii=False, indent="\t") + "\n",
                encoding="utf-8",
            )
            # Add subdirectory to parent migrated list
            migrated.append(subdir.name)
            print(f"  ✓ subdir: {section}/{subdir.name}/ ({len(sub_slugs)} pages)")

    # Update meta.json
    if migrated:
        meta = {"pages": migrated + ["---"]}
        (target_dir / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent="\t") + "\n",
            encoding="utf-8",
        )

    print(f"  → {section}: {len(migrated)} pages migrated")
    return migrated


def main():
    total = 0
    for section in SECTION_NAMES:
        print(f"\n[{section}] {SECTION_NAMES[section]}")
        pages = migrate_section(section)
        total += len(pages)

    print(f"\n{'='*40}")
    print(f"Migration complete: {total} pages total")


if __name__ == "__main__":
    main()
