#!/usr/bin/env python3
"""Extract all data from original LFO website HTML files into JSON."""

import json
import os
import re
import glob

ORIGINAL_DIR = "/Users/niskan516/Downloads/lfostory-original/index2"
OUTPUT_DIR = "/Users/niskan516/Sync/Workspace/dev/web/lfo-wiki/data"


def clean_html(text):
    """Remove HTML tags and clean whitespace."""
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&#\d+;', '', text)
    text = re.sub(r'&[a-z]+;', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def clean_html_preserve_links(text):
    """Remove HTML tags but convert <a> tags to markdown links first."""
    text = re.sub(r'<br\s*/?>', '\n', text)
    # Convert <a href="...">text</a> to [text](url), normalizing relative URLs
    def replace_link(m):
        href = m.group(1)
        link_text = re.sub(r'<[^>]+>', '', m.group(2)).strip()
        # Normalize relative URLs
        href = re.sub(r'^(\.\./)+', '', href)
        if not href.startswith('http'):
            href = 'https://' + href
        if link_text:
            return f'[{link_text}]({href})'
        return ''
    text = re.sub(r'<a[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>', replace_link, text, flags=re.DOTALL)
    # Remove remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'&gt;', '>', text)
    text = re.sub(r'&lt;', '<', text)
    text = re.sub(r'&amp;', '&', text)
    text = re.sub(r'&nbsp;', ' ', text)
    text = re.sub(r'&#\d+;', '', text)
    text = re.sub(r'&[a-z]+;', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def table_to_cells(table_html):
    """Convert table HTML to flat list of cleaned cells."""
    clean = re.sub(r'<[^>]+>', '|', table_html)
    clean = re.sub(r'\|+', '|', clean)
    return [c.strip() for c in clean.split('|') if c.strip()]


def extract_imgs(html):
    """Extract imgur image URLs from HTML."""
    imgs = re.findall(r'(?:src|href)="([^"]*imgur\.com[^"]*)"', html)
    result = []
    for url in imgs:
        if not url.startswith("http"):
            url = "https://" + url.lstrip("./")
        result.append(url)
    return list(set(result))


def fix_url(url):
    """Fix relative imgur URLs to absolute."""
    if not url.startswith("http"):
        url = "https://" + url.lstrip("./")
    url = url.replace("http://i.imgur.com", "https://i.imgur.com")
    return url


def extract_portrait_groups():
    """Extract portrait groups with associated dialog images from character pages.

    Parses the '角色型像及對話圖' table where each row has:
    - Left column: portrait image + label
    - Right column: associated dialog images
    """
    print("Extracting portrait groups...")
    char_dir = os.path.join(ORIGINAL_DIR, "character")
    all_groups = {}

    img_pattern = r'<img[^>]*src="([^"]*imgur[^"]*?)"[^>]*>'

    for filepath in sorted(glob.glob(os.path.join(char_dir, "*.html"))):
        slug = os.path.basename(filepath).replace(".html", "")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        # Find the portrait/dialog section
        section_start = content.find("角色型像及對話圖")
        if section_start < 0:
            continue

        # Find the table within this section
        table_start = content.find("<table", section_start)
        if table_start < 0:
            continue

        # Find matching </table>
        table_end = content.find("</table>", table_start)
        if table_end < 0:
            continue
        table_html = content[table_start:table_end + len("</table>")]

        # Split into rows
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL)

        portrait_groups = []
        for row in rows:
            # Split into cells
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
            if len(cells) < 2:
                continue

            left_cell = cells[0]
            right_cell = cells[1]

            # Skip header row (型像圖片及名稱 / 相關對話圖)
            left_text = re.sub(r'<[^>]+>', ' ', left_cell).strip()
            if "型像圖片" in left_text or "相關對話" in left_text:
                continue

            # Extract portrait image from left cell
            portrait_match = re.search(img_pattern, left_cell)
            if not portrait_match:
                continue
            portrait_url = fix_url(portrait_match.group(1))

            # Extract label from left cell (text after <br> or after the image)
            # Remove img tags and extract remaining text
            label_text = re.sub(r'<img[^>]*>', '', left_cell)
            label_text = re.sub(r'<[^>]+>', ' ', label_text)
            label_text = re.sub(r'&[a-z]+;', ' ', label_text)
            label_text = label_text.strip()
            if not label_text:
                label_text = "型像"

            # Extract dialog images from right cell
            dialog_urls = []
            for m in re.finditer(img_pattern, right_cell):
                dialog_urls.append(fix_url(m.group(1)))

            portrait_groups.append({
                "label": label_text,
                "portrait": portrait_url,
                "dialogs": dialog_urls,
            })

        if portrait_groups:
            all_groups[slug] = portrait_groups

    print(f"  Extracted portrait groups for {len(all_groups)} characters")
    return all_groups


# ============================================================
# 1. Extract character profile data
# ============================================================
def extract_character_profiles():
    print("Extracting character profiles...")
    char_dir = os.path.join(ORIGINAL_DIR, "character")
    profiles = {}

    for filepath in sorted(glob.glob(os.path.join(char_dir, "*.html"))):
        slug = os.path.basename(filepath).replace(".html", "")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        idx = content.find("出生地")
        if idx < 0:
            print(f"  WARN: No profile found for {slug}")
            continue

        chunk = content[idx:idx + 8000]
        clean = re.sub(r'<[^>]+>', '\n', chunk)
        lines = [l.strip() for l in clean.split('\n') if l.strip()]

        profile = {"slug": slug}

        # Birthplace
        for i, line in enumerate(lines):
            if line == "出生地" and i + 1 < len(lines):
                profile["birthplace"] = lines[i + 1]
                break

        # Identity - may span multiple lines until 戰鬥方式
        identity_parts = []
        collecting = False
        for i, line in enumerate(lines):
            if line == "身份":
                collecting = True
                continue
            if collecting and line == "戰鬥方式":
                break
            if collecting:
                identity_parts.append(line)
        profile["identity"] = "".join(identity_parts)

        # Combat style - may span multiple lines until 實裝版本
        combat_parts = []
        collecting = False
        for i, line in enumerate(lines):
            if line == "戰鬥方式":
                collecting = True
                continue
            if collecting and line == "實裝版本":
                break
            if collecting:
                combat_parts.append(line)
        profile["combatStyle"] = "".join(combat_parts)

        # Weapon info
        weapon_idx = None
        for i, line in enumerate(lines):
            if "角色專用武器" in line:
                weapon_idx = i
                break

        if weapon_idx is not None:
            weapon_section = lines[weapon_idx:weapon_idx + 30]
            has_no_weapon = any("不適用" in l for l in weapon_section[:3])
            if not has_no_weapon:
                weapon = {}
                for i, line in enumerate(weapon_section):
                    if line == "名稱" and i + 1 < len(weapon_section):
                        weapon["name"] = weapon_section[i + 1]
                    if line == "特效" and i + 1 < len(weapon_section):
                        weapon["effect"] = weapon_section[i + 1]
                    if line == "耐久" and i + 1 < len(weapon_section):
                        weapon["durability"] = weapon_section[i + 1]
                    if line == "說明" and i + 1 < len(weapon_section):
                        weapon["description"] = weapon_section[i + 1]
                if weapon.get("name"):
                    profile["weapon"] = weapon

        # Equipment info
        equip_idx = None
        for i, line in enumerate(lines):
            if "角色專用裝備" in line:
                equip_idx = i
                break

        if equip_idx is not None:
            equip_section = lines[equip_idx:equip_idx + 40]
            has_no_equip = any("不適用" in l for l in equip_section[:3])
            if not has_no_equip:
                equip = {}
                for i, line in enumerate(equip_section):
                    if line == "名稱" and i + 1 < len(equip_section):
                        equip["name"] = equip_section[i + 1]
                stats = {}
                stat_names = {"生命值": "hp", "元力值": "mp", "氣力值": "sp",
                              "攻擊力": "str", "防禦力": "def", "敏捷度": "agi"}
                for i, line in enumerate(equip_section):
                    if line in stat_names and i + 1 < len(equip_section):
                        val = equip_section[i + 1]
                        if val.startswith("+") or val.startswith("-"):
                            stats[stat_names[line]] = val
                if stats:
                    equip["stats"] = stats
                if equip.get("name"):
                    profile["equipment"] = equip

        # Skill names from 角色必殺技圖片 section
        skill_names = []
        skill_idx = None
        for i, line in enumerate(lines):
            if "查看詳細招式表" in line or "角色必殺技圖片" in line:
                skill_idx = i
                break

        if skill_idx is not None:
            for i in range(skill_idx + 1, min(skill_idx + 30, len(lines))):
                if "角色基本動作" in lines[i]:
                    break
                if "查看詳細招式表" in lines[i] or "僅收錄" in lines[i]:
                    continue
                name = lines[i].strip()
                if name and len(name) < 20 and not name.startswith("~"):
                    skill_names.append(name)
            if skill_names:
                profile["skillNames"] = skill_names

        profiles[slug] = profile

    print(f"  Extracted profiles for {len(profiles)} characters")
    return profiles


# ============================================================
# 2. Extract character skills/stats
# ============================================================
def extract_character_skills():
    print("Extracting character skills...")
    skills_dir = os.path.join(ORIGINAL_DIR, "dex", "skills_v2")
    all_skills = {}

    stat_map = {"HP": "hp", "MP": "mp", "SP": "sp",
                "STR": "str", "DEF": "def", "AGI": "agi"}

    for filepath in sorted(glob.glob(os.path.join(skills_dir, "*.html"))):
        slug = os.path.basename(filepath).replace(".html", "")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        char_data = {"slug": slug, "stats": {}, "skills": []}
        tables = re.findall(r'<table[^>]*>(.*?)</table>', content, re.DOTALL)

        # Extract stats from stat tables (tables with HP + 能力值/成長值)
        # When both 改版前 and 目前 tabs exist, tables appear as:
        #   Table 0 = 改版前起初能力 (before), Table 1 = 目前起初能力 (current), Table 2 = 能力比較
        # When only one tab exists, there's just one stat table = current
        has_tabs = "改版前起初能力" in content and "目前起初能力" in content
        stat_tables = []
        for table in tables:
            if '能力值' in table and '成長值' in table:
                cells = table_to_cells(table)
                stats = {}
                for j, cell in enumerate(cells):
                    if cell in stat_map and j + 2 < len(cells):
                        val = cells[j + 1]
                        growth = cells[j + 2]
                        # Skip comparison table (has ↑ values)
                        if '↑' in val or '↑' in growth:
                            continue
                        stats[stat_map[cell]] = {
                            "base": val,
                            "growth": growth
                        }
                if stats:
                    stat_tables.append(stats)

        if has_tabs and len(stat_tables) >= 2:
            char_data["stats"]["before"] = stat_tables[0]
            char_data["stats"]["current"] = stat_tables[1]
        elif stat_tables:
            char_data["stats"]["current"] = stat_tables[0]

        # Build a map of skill name -> GIF demo URL from anchor tags
        skill_gif_map = {}
        gif_anchors = re.findall(
            r'<a[^>]*href=["\']([^"\']*\.gif)["\'][^>]*>(.*?)</a>',
            content, re.DOTALL
        )
        for href, text in gif_anchors:
            name = re.sub(r'<[^>]+>', '', text).strip()
            if name:
                url = href
                url = re.sub(r'^(\.\./)+', '', url)
                if not url.startswith('http'):
                    url = 'https://' + url
                skill_gif_map[name] = url

        # Build a map of skill name -> icon URL from img tags with title
        skill_icon_map = {}
        # Match src before title
        for src, title in re.findall(
            r'<img[^>]*src=["\']([^"\']*\.png)["\'][^>]*title=["\']([^"\']*)["\'][^>]*/?\s*>',
            content
        ):
            if title and len(title) < 30:
                url = re.sub(r'^(\.\./)+', '', src)
                if not url.startswith('http'):
                    url = 'https://' + url
                skill_icon_map[title] = url
        # Match title before src
        for title, src in re.findall(
            r'<img[^>]*title=["\']([^"\']*)["\'][^>]*src=["\']([^"\']*\.png)["\'][^>]*/?\s*>',
            content
        ):
            if title and len(title) < 30:
                url = re.sub(r'^(\.\./)+', '', src)
                if not url.startswith('http'):
                    url = 'https://' + url
                skill_icon_map[title] = url

        # Split content into normal and transform sections
        # The page has two "技能資料" headings - the second one starts the transform section
        skill_data_positions = [m.start() for m in re.finditer('技能資料', content)]
        has_transform_section = len(skill_data_positions) >= 2

        if has_transform_section:
            transform_section_start = skill_data_positions[1]
        else:
            transform_section_start = -1

        def extract_skill_from_table(table_html):
            """Extract a single skill from a table containing 招式名稱 headers."""
            cells = table_to_cells(table_html)
            header_idx = None
            for j, cell in enumerate(cells):
                if cell == "招式名稱":
                    header_idx = j
                    break
            if header_idx is None:
                return None

            val_start = header_idx + 5
            if val_start >= len(cells):
                return None

            skill = {}
            if val_start < len(cells):
                skill["name"] = cells[val_start]
            if val_start + 1 < len(cells):
                skill["command"] = cells[val_start + 1]
            if val_start + 2 < len(cells):
                skill["cost"] = cells[val_start + 2]
            if val_start + 3 < len(cells):
                skill["learnPoints"] = cells[val_start + 3]
            if val_start + 4 < len(cells):
                skill["trigger"] = cells[val_start + 4]

            # Extract P.S. notes - use raw HTML to preserve <a> links
            ps_match = re.search(
                r'P\.S\.</b></td><td[^>]*>(.*?)</td>\s*</tr>',
                table_html, re.DOTALL
            )
            if ps_match:
                ps_html = ps_match.group(1)
                skill["notes"] = clean_html_preserve_links(ps_html)
            else:
                # Fallback: extract from cells (no links)
                for j, cell in enumerate(cells):
                    if cell == "P.S.":
                        ps_text = " ".join(cells[j + 1:])
                        skill["notes"] = clean_html(ps_text)
                        break

            # Add GIF demo URL and icon
            if skill.get("name"):
                if skill["name"] in skill_gif_map:
                    skill["gif"] = skill_gif_map[skill["name"]]
                if skill["name"] in skill_icon_map:
                    skill["icon"] = skill_icon_map[skill["name"]]

            return skill if skill.get("name") else None

        # Split content into sections and extract skills from each
        normal_skills = []
        transform_skills = []

        if has_transform_section:
            normal_content = content[:transform_section_start]
            transform_content = content[transform_section_start:]
        else:
            normal_content = content
            transform_content = ""

        # Extract from normal section
        for table in re.findall(r'<table[^>]*>(.*?)</table>', normal_content, re.DOTALL):
            if '招式名稱' not in table or '出招方法' not in table:
                continue
            skill = extract_skill_from_table(table)
            if skill:
                normal_skills.append(skill)

        # Extract from transform section
        if transform_content:
            for table in re.findall(r'<table[^>]*>(.*?)</table>', transform_content, re.DOTALL):
                if '招式名稱' not in table or '出招方法' not in table:
                    continue
                skill = extract_skill_from_table(table)
                if skill:
                    transform_skills.append(skill)

        char_data["skills"] = normal_skills
        if transform_skills:
            char_data["transformSkills"] = transform_skills

        # Post-process: find P.S. notes with <a> links in the raw HTML
        # The non-greedy table regex misses outer tables with nested tables,
        # so we scan the full content for P.S. <td> cells containing links.
        for ps_m in re.finditer(
            r'P\.S\.</b></td><td[^>]*>(.*?)</td>\s*</tr>\s*</tbody>',
            content, re.DOTALL
        ):
            ps_html = ps_m.group(1)
            if '<a ' not in ps_html:
                continue
            # Find the skill name by looking backward for the value row
            # after 招式名稱 header
            before = content[:ps_m.start()]
            # Find the last skill name in a value row
            name_matches = re.findall(
                r'</tr>\s*<tr>.*?<td[^>]*>(?:<[^>]*>)*([^<]{1,30}?)(?:<[^>]*>)*\s*</td>',
                before[-3000:], re.DOTALL
            )
            # Also try extracting from <a> links (skill name as link text)
            link_names = re.findall(
                r'</tr>\s*<tr>.*?<td[^>]*>.*?<a[^>]*>(?:<[^>]*>)*([^<]{1,30})',
                before[-3000:], re.DOTALL
            )
            skill_name = None
            if link_names:
                skill_name = link_names[-1].strip()
            elif name_matches:
                skill_name = name_matches[-1].strip()
            if not skill_name:
                continue

            enriched_notes = clean_html_preserve_links(ps_html)
            # Match to an existing skill - find best match by scoring
            def name_score(sn, target):
                """Score how well skill name sn matches target. Higher = better.
                Prioritizes shared prefix length and penalizes length difference."""
                if not sn or not target:
                    return 0
                if sn == target:
                    return 100
                # Count shared characters from start (prefix match)
                prefix_len = 0
                for c1, c2 in zip(sn, target):
                    if c1 == c2:
                        prefix_len += 1
                    else:
                        break
                # Shared prefix is weighted heavily (x3)
                score = prefix_len * 3
                # Bonus for same ending
                if sn[-1] == target[-1]:
                    score += 2
                # Penalty for length difference
                score -= abs(len(sn) - len(target))
                return score

            all_skill_lists = [normal_skills, transform_skills]
            best_skill = None
            best_score = 0
            for skill_list in all_skill_lists:
                for skill in skill_list:
                    sn = skill.get("name", "")
                    score = name_score(sn, skill_name)
                    if score > best_score:
                        best_score = score
                        best_skill = skill
            if best_skill and best_score >= 3:
                if '[' in enriched_notes and '](' in enriched_notes:
                    best_skill["notes"] = enriched_notes

        # Extract hidden skills (隱藏動作/技能資料)
        hidden_idx = content.find('隱藏動作')
        if hidden_idx >= 0:
            # Check if section has actual data (not 無相關數據)
            hidden_chunk = content[hidden_idx:hidden_idx + 15000]
            if '無相關數據' not in hidden_chunk[:200]:
                # Extract hidden skill entries from the table with 動作名稱 headers
                hidden_table_match = re.search(
                    r'<table[^>]*>(.*?)</table>', hidden_chunk, re.DOTALL
                )
                if hidden_table_match:
                    hidden_table = hidden_table_match.group(1)
                    # Find all <td> cells containing category + link pairs
                    cells = re.findall(r'<td[^>]*>(.*?)</td>', hidden_table, re.DOTALL)
                    hidden_skills = []
                    for cell in cells:
                        # Skip header cells
                        if '動作名稱' in cell:
                            continue
                        # Strip HTML tags first, then extract category 【...】
                        cell_text = re.sub(r'<[^>]+>', '', cell)
                        cat_match = re.search(r'【(.*?)】', cell_text)
                        # Extract link with GIF
                        link_match = re.search(
                            r'<a[^>]*href=["\']([^"\']*\.gif)["\'][^>]*>(.*?)</a>',
                            cell, re.DOTALL
                        )
                        if cat_match and link_match:
                            category = cat_match.group(1).strip()
                            gif_url = link_match.group(1)
                            gif_url = re.sub(r'^(\.\./)+', '', gif_url)
                            if not gif_url.startswith('http'):
                                gif_url = 'https://' + gif_url
                            name_raw = link_match.group(2)
                            name = re.sub(r'<[^>]+>', '', name_raw).strip()
                            # Some names have trailing text like (轉載)
                            hidden_skills.append({
                                "category": category,
                                "name": name,
                                "gif": gif_url,
                            })
                    if hidden_skills:
                        char_data["hiddenSkills"] = hidden_skills

                # Extract 附加說明 notes
                # The header "附加說明" is often split across HTML tags
                # e.g. "附加</b><b>說明" or "附加</b><b style=...>說明"
                # Strategy: find "附加" followed by "說明" with HTML tags in between,
                # then extract the notes content from the following table row(s)
                notes_match = re.search(
                    r'附加(?:</[^>]*>\s*<[^>]*>)*說明.*?</td>\s*</tr>\s*<tr[^>]*>\s*<td[^>]*>(.*?)(?:</table>|</tbody>)',
                    hidden_chunk, re.DOTALL
                )
                if not notes_match:
                    # Fallback: try exact "附加說明" (davis format)
                    notes_match = re.search(
                        r'附加說明.*?</td>.*?<td[^>]*>(.*?)(?:</table>|</tbody>)',
                        hidden_chunk, re.DOTALL
                    )
                if notes_match:
                    notes_html = notes_match.group(1)
                    # Preserve colored/highlighted text by converting font color
                    # tags to {{color:text}} format before stripping HTML.
                    # Handles <font color="#00ff00">text</font> and nested tags
                    # inside the font element.
                    def replace_font_color(m):
                        color = m.group(1).lstrip('#').lower()
                        inner = re.sub(r'<[^>]+>', '', m.group(2))
                        inner = inner.strip()
                        if inner:
                            return '{{#' + color + ':' + inner + '}}'
                        return ''
                    notes_html = re.sub(
                        r'<font[^>]*color=["\']#?([0-9a-fA-F]+)["\'][^>]*>(.*?)</font>',
                        replace_font_color, notes_html, flags=re.DOTALL
                    )
                    # Also handle <span style="color:rgb(r,g,b)">text</span>
                    def replace_span_color(m):
                        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
                        color = f'{r:02x}{g:02x}{b:02x}'
                        inner = re.sub(r'<[^>]+>', '', m.group(4))
                        inner = inner.strip()
                        if inner:
                            return '{{#' + color + ':' + inner + '}}'
                        return ''
                    notes_html = re.sub(
                        r'<span[^>]*style="[^"]*color:\s*rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)[^"]*"[^>]*>(.*?)</span>',
                        replace_span_color, notes_html, flags=re.DOTALL
                    )
                    # Split by ⊕ or ‧ markers or <div> blocks
                    # First, replace <br> and </div><div> with newlines
                    notes_text = re.sub(r'<br\s*/?>', '\n', notes_html)
                    notes_text = re.sub(r'</div>\s*<div[^>]*>', '\n', notes_text)
                    notes_text = re.sub(r'<[^>]+>', '', notes_text)
                    notes_text = re.sub(r'&[a-z]+;', '', notes_text)
                    notes_text = re.sub(r'&#\d+;', '', notes_text)
                    # Split by ⊕ or ‧ markers and clean
                    parts = re.split(r'[⊕‧]', notes_text)
                    hidden_notes = []
                    for part in parts:
                        line = part.strip().replace('\u3000', ' ').strip()
                        # Merge continuation lines (starting with spaces)
                        line = re.sub(r'\n\s+', '', line)
                        line = re.sub(r'\s+', ' ', line).strip()
                        if line:
                            hidden_notes.append(line)
                    if hidden_notes:
                        char_data["hiddenNotes"] = hidden_notes

        all_skills[slug] = char_data

    print(f"  Extracted skills for {len(all_skills)} characters")
    return all_skills


# ============================================================
# 3. Extract beast data
# ============================================================
def extract_beasts():
    print("Extracting beast data...")
    beast_dir = os.path.join(ORIGINAL_DIR, "beast")
    beasts = {}

    beast_names = {
        "casso": "狂旺獸", "crawley": "克拉雷", "dashs": "達希斯",
        "dega": "狄加", "duba": "杜巴", "gneuss": "格諾斯", "nacala": "納卡拉"
    }

    stat_map = {"HP": "hp", "MP": "mp", "SP": "sp",
                "STR": "str", "DEF": "def", "AGI": "agi"}

    for filepath in sorted(glob.glob(os.path.join(beast_dir, "*.html"))):
        slug = os.path.basename(filepath).replace(".html", "")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        beast = {"slug": slug, "name": beast_names.get(slug, slug)}
        tables = re.findall(r'<table[^>]*>(.*?)</table>', content, re.DOTALL)

        # Stats
        for marker, key in [("普通版起初能力", "normalStats"), ("強化版起初能力", "enhancedStats")]:
            idx = content.find(marker)
            if idx >= 0:
                chunk = content[idx:idx + 2000]
                table_match = re.search(r'<table[^>]*>(.*?)</table>', chunk, re.DOTALL)
                if table_match:
                    cells = table_to_cells(table_match.group(1))
                    stats = {}
                    for j, cell in enumerate(cells):
                        if cell in stat_map and j + 2 < len(cells):
                            stats[stat_map[cell]] = {
                                "base": cells[j + 1],
                                "growth": cells[j + 2]
                            }
                    if stats:
                        beast[key] = stats

        # Fallback: generic stats extraction
        if "normalStats" not in beast:
            for table in tables:
                if '能力值' in table and ('每加1點的效果' in table or '成長值' in table):
                    cells = table_to_cells(table)
                    stats = {}
                    for j, cell in enumerate(cells):
                        if cell in stat_map and j + 2 < len(cells):
                            stats[stat_map[cell]] = {
                                "base": cells[j + 1],
                                "growth": cells[j + 2]
                            }
                    if stats:
                        beast["normalStats"] = stats
                        break

        # Skills
        skills = []
        for table in tables:
            if ('招式名稱' in table or '技能' in table) and ('出招方法' in table or '消耗能力' in table):
                cells = table_to_cells(table)
                skill = {}
                for j, cell in enumerate(cells):
                    if cell in ("招式名稱", "招式名稱 ") and j + 1 < len(cells):
                        skill["name"] = cells[j + 1]
                    elif cell in ("出招方法", "出招方法 ") and j + 1 < len(cells):
                        skill["command"] = cells[j + 1]
                    elif cell in ("消耗能力",) and j + 1 < len(cells):
                        skill["cost"] = cells[j + 1]
                    elif re.match(r'^技能\d+$', cell) and j + 1 < len(cells):
                        skill["name"] = f"{cell}"

                # If we didn't get a name but have command/cost, try harder
                if not skill.get("name"):
                    for j, cell in enumerate(cells):
                        if re.match(r'^技能\d+$', cell):
                            skill["name"] = cell
                            break

                if skill.get("command") or skill.get("cost"):
                    skills.append(skill)

        if skills:
            beast["skills"] = skills

        beasts[slug] = beast

    print(f"  Extracted {len(beasts)} beasts")
    return beasts


# ============================================================
# 3b. Extract transform (異轉) data from r.html pages
# ============================================================
def extract_transforms():
    print("Extracting transform data...")
    char_dir = os.path.join(ORIGINAL_DIR, "character")
    transforms = {}

    profile_fields = {
        "出生地": "birthplace",
        "身份": "identity",
        "戰鬥方式": "combatStyle",
    }

    for dirpath in sorted(glob.glob(os.path.join(char_dir, "*/"))):
        slug = os.path.basename(dirpath.rstrip("/"))
        r_path = os.path.join(dirpath, "r.html")
        if not os.path.exists(r_path):
            continue

        with open(r_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Strip scripts/styles for text extraction
        text = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL)
        text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL)
        text = re.sub(r'<[^>]+>', '\n', text)
        lines = [l.strip() for l in text.split('\n') if l.strip()]

        transform = {"slug": slug}

        # Extract transform action GIF (first GIF before 異轉動作 text)
        action_idx = content.find('異轉動作')
        if action_idx < 0:
            action_idx = content.find('異轉')
        if action_idx >= 0:
            chunk = content[:action_idx + 200]
            action_gifs = re.findall(r'src="([^"]*\.gif)"', chunk)
            if action_gifs:
                url = action_gifs[-1]
                if not url.startswith("http"):
                    url = "https://" + url.lstrip("./")
                    url = re.sub(r'https://\.\./+', 'https://', url)
                    url = url.replace('../../../../../', 'https://')
                transform["transformGif"] = url

        # Extract profile fields
        for i, line in enumerate(lines):
            if line in profile_fields and i + 1 < len(lines):
                transform[profile_fields[line]] = lines[i + 1]
            # Version (實裝版本)
            if line == "實裝版本" and i + 1 < len(lines):
                # May span two lines: "v6.0" + "決戰聖域篇"
                ver = lines[i + 1]
                if i + 2 < len(lines) and not any(k in lines[i + 2] for k in ["~", "出生", "身份", "戰鬥", "角色"]):
                    next_line = lines[i + 2]
                    if re.match(r'^[\u4e00-\u9fff]', next_line) and len(next_line) < 20:
                        ver = ver + " " + next_line
                transform["version"] = ver
            # 異轉信物 (sometimes written as 轉信物：)
            if "轉信物" in line:
                # Relic name might be on same line after colon or next line
                after_colon = re.search(r'轉信物[：:](.+)', line)
                if after_colon and after_colon.group(1).strip():
                    transform["relic"] = after_colon.group(1).strip()
                elif i + 1 < len(lines):
                    relic = lines[i + 1]
                    if relic and not relic.startswith("~") and not relic.startswith("角色"):
                        transform["relic"] = relic

                # Extract relicImage: image immediately before 轉信物 in raw HTML (gif, jpg, or png)
                relic_idx = content.find('轉信物')
                if relic_idx >= 0:
                    before_relic = content[max(0, relic_idx - 1000):relic_idx]
                    relic_imgs = re.findall(
                        r'src=["\']([^"\']*\.(gif|jpg|jpeg|png))["\']',
                        before_relic, re.IGNORECASE
                    )
                    if relic_imgs:
                        relic_img_url = relic_imgs[-1][0]
                        if not relic_img_url.startswith("http"):
                            relic_img_url = re.sub(r'^(\.\./)+', '', relic_img_url)
                            if not relic_img_url.startswith("http"):
                                relic_img_url = "https://" + relic_img_url
                        transform["relicImage"] = relic_img_url
            # Description (after ~角色簡介~)
            if line == "~角色簡介~" and i + 1 < len(lines):
                transform["description"] = lines[i + 1]

        # Extract images (skill images, action gifs, portraits)
        imgs = extract_imgs(content)
        skill_imgs = []
        action_gifs = []

        for url in imgs:
            if url.endswith('.gif'):
                action_gifs.append(url)
            elif '.png' in url or '.jpg' in url or '.jpeg' in url:
                skill_imgs.append(url)

        # Exclude relicImage from actionGifs
        relic_img = transform.get("relicImage")
        if relic_img:
            action_gifs = [u for u in action_gifs if u != relic_img]

        # Try to get labeled action gifs
        gif_labels = ["普攻", "跑攻", "跳攻", "跑步", "滾動", "武器", "跳躍揮動武器"]
        labeled_gifs = []
        for i, url in enumerate(action_gifs):
            label = gif_labels[i] if i < len(gif_labels) else f"動作{i+1}"
            labeled_gifs.append({"url": url, "label": label})
        if labeled_gifs:
            transform["actionGifs"] = labeled_gifs

        # Try to get labeled skill images
        # Find skill image names from text - stop at metadata boundaries
        skill_names = []
        # Set of names that are metadata, not actual skill names
        garbage_names = {
            "角色專用武器", "角色專用裝備", "角色基本動作", "角色型像及對話圖",
            "角色型像", "查看詳細招式表", "暫無圖片", "圖片", "名稱", "成份",
            "附加", "能力", "生命值", "元力值", "氣力值", "攻擊力", "防禦力",
            "敏捷度", "需求", "耐久", "說明", "型像圖片及名稱", "相關對話圖",
            "異轉型像",
        }
        for i, line in enumerate(lines):
            if line == "角色必殺技圖片" or line == "~僅收錄在網上流傳的圖片~":
                # Collect skill names after this
                for j in range(i + 1, min(i + 20, len(lines))):
                    l = lines[j]
                    # Stop at section boundaries
                    if l.startswith("角色基本動作") or l.startswith("角色型像") or \
                       l.startswith("角色專用武器") or l.startswith("角色專用裝備"):
                        break
                    if re.match(r'^[\u4e00-\u9fff]', l) and len(l) < 15 and l not in garbage_names \
                       and not l.startswith("~"):
                        skill_names.append(l)

        # Extract skill images from the HTML section between 角色必殺技圖片 and the next section
        # This avoids picking up weapon/equipment table images
        skill_section_start = content.find("角色必殺技圖片")
        # Find the end of the skill images section
        skill_section_end = len(content)
        for boundary in ["角色專用武器", "角色專用裝備", "角色基本動作", "角色型像"]:
            idx = content.find(boundary, skill_section_start + 1) if skill_section_start >= 0 else -1
            if idx >= 0 and idx < skill_section_end:
                skill_section_end = idx

        labeled_skills = []
        if skill_section_start >= 0 and skill_names:
            skill_section = content[skill_section_start:skill_section_end]
            # Extract non-gif images from just the skill section
            skill_section_imgs = re.findall(r'(?:src|href)="([^"]*imgur\.com[^"]*)"', skill_section)
            skill_img_urls = []
            for url in skill_section_imgs:
                if not url.startswith("http"):
                    url = "https://" + url.lstrip("./")
                if not url.endswith('.gif'):
                    skill_img_urls.append(url)
            # Deduplicate while preserving order
            seen = set()
            unique_skill_imgs = []
            for url in skill_img_urls:
                if url not in seen:
                    seen.add(url)
                    unique_skill_imgs.append(url)
            # Exclude relicImage
            relic_img = transform.get("relicImage")
            if relic_img:
                unique_skill_imgs = [u for u in unique_skill_imgs if u != relic_img]
            # Only pair up to the number of skill names we found
            for i, name in enumerate(skill_names):
                if i < len(unique_skill_imgs):
                    labeled_skills.append({"url": unique_skill_imgs[i], "name": name})

        if labeled_skills:
            transform["skillImages"] = labeled_skills

        # Extract equipment data from tables
        tables = re.findall(r'<table[^>]*>(.*?)</table>', content, re.DOTALL)
        for table in tables:
            cells = table_to_cells(table)
            if "名稱" in cells and ("耐久" in cells or "附加" in cells):
                equip = {}
                for j, cell in enumerate(cells):
                    if cell == "名稱" and j + 1 < len(cells):
                        equip["name"] = cells[j + 1]
                    elif cell == "耐久" and j + 1 < len(cells):
                        equip["durability"] = cells[j + 1]
                    elif cell == "說明" and j + 1 < len(cells):
                        equip["description"] = cells[j + 1]

                # Check if it's a weapon or equipment
                stat_names = {"生命值": "hp", "元力值": "mp", "氣力值": "sp",
                              "攻擊力": "str", "防禦力": "def", "敏捷度": "agi"}
                stats = {}
                for j, cell in enumerate(cells):
                    if cell in stat_names and j + 1 < len(cells):
                        val = cells[j + 1]
                        if val and val not in ("--",):
                            stats[stat_names[cell]] = val
                if stats:
                    equip["stats"] = stats

                if equip.get("name"):
                    # Check context: 武器 or 裝備
                    if "專用武器" in content[:content.find(table)] and "不適用" not in content[content.find("專用武器"):content.find("專用武器")+100]:
                        transform["weapon"] = equip
                    else:
                        transform["equipment"] = equip

        # Extract portrait groups (角色型像及對話圖) from r.html
        img_pat = r'<img[^>]*src="([^"]*imgur[^"]*?)"[^>]*>'
        section_start = content.find("角色型像及對話圖")
        if section_start >= 0:
            table_start = content.find("<table", section_start)
            table_end = content.find("</table>", table_start) if table_start >= 0 else -1
            if table_start >= 0 and table_end >= 0:
                table_html = content[table_start:table_end + len("</table>")]
                rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL)
                portrait_groups = []
                for row in rows:
                    cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
                    if len(cells) < 2:
                        continue
                    left_cell, right_cell = cells[0], cells[1]
                    left_text = re.sub(r'<[^>]+>', ' ', left_cell).strip()
                    if "型像圖片" in left_text or "相關對話" in left_text:
                        continue
                    portrait_match = re.search(img_pat, left_cell)
                    if not portrait_match:
                        continue
                    portrait_url = fix_url(portrait_match.group(1))
                    label_text = re.sub(r'<img[^>]*>', '', left_cell)
                    label_text = re.sub(r'<[^>]+>', ' ', label_text)
                    label_text = re.sub(r'&[a-z]+;', ' ', label_text).strip()
                    if not label_text:
                        label_text = "異轉型像"
                    dialog_urls = [fix_url(m.group(1)) for m in re.finditer(img_pat, right_cell)]
                    portrait_groups.append({
                        "label": label_text,
                        "portrait": portrait_url,
                        "dialogs": dialog_urls,
                    })
                if portrait_groups:
                    transform["portraitGroups"] = portrait_groups

        transforms[slug] = transform

    print(f"  Extracted {len(transforms)} transforms")
    return transforms


# ============================================================
# 4. Extract items data (weapons, armor, consumables, cosmetics, sets)
# ============================================================
def extract_items():
    print("Extracting items data...")
    items_dir = os.path.join(ORIGINAL_DIR, "items")
    all_items = {}

    # Only process files that actually have content
    item_categories = {
        "armor": "裝備",
        "weapon": "武器",
        "consumables": "消耗品",
        "head": "摩摩星人",
        "set": "套裝",
    }

    for filename, category in item_categories.items():
        filepath = os.path.join(items_dir, f"{filename}.html")
        if not os.path.exists(filepath) or os.path.getsize(filepath) == 0:
            continue

        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        tables = re.findall(r'<table[^>]*>(.*?)</table>', content, re.DOTALL)
        items_in_file = []

        for table in tables:
            if '名稱' not in table:
                continue
            # Skip breadcrumb/navigation tables
            if '博物館大廳' in table:
                continue

            cells = table_to_cells(table)
            if len(cells) < 5:
                continue

            # Find the "名稱" marker
            name_idx = None
            for j, cell in enumerate(cells):
                if cell == "名稱":
                    name_idx = j
                    break
            if name_idx is None:
                continue

            # Determine column fields by scanning for known field names
            field_markers = {"圖片", "名稱", "成份", "演示", "特效", "消耗", "耐久",
                            "說明", "價格", "附加", "能力", "需求", "類別", "效果",
                            "生命值", "元力值", "氣力值", "攻擊力", "防禦力", "敏捷度"}

            # Find all field positions
            field_positions = []
            for j, cell in enumerate(cells):
                if cell in field_markers:
                    field_positions.append((j, cell))

            # Find names: cells between 名稱 and the next field
            names = []
            next_field_idx = len(cells)
            for j, cell in enumerate(cells):
                if j > name_idx and cell in field_markers:
                    next_field_idx = j
                    break
            names = cells[name_idx + 1:next_field_idx]

            if not names:
                continue

            num_cols = len(names)

            # Extract field values for each column
            field_data = {}
            for fp_idx, (pos, field_name) in enumerate(field_positions):
                if field_name == "名稱" or field_name == "圖片":
                    continue
                # Values follow the field name
                vals_start = pos + 1
                # Find where next field begins
                next_fp = len(cells)
                for np, nf in field_positions:
                    if np > pos and np != pos:
                        next_fp = np
                        break
                vals = cells[vals_start:next_fp]
                field_data[field_name] = vals[:num_cols]  # Limit to column count

            # Build item objects
            for idx, name in enumerate(names):
                item = {"name": name, "category": category}

                # Map fields
                field_map = {
                    "成份": "material", "特效": "effect", "耐久": "durability",
                    "說明": "description", "價格": "price", "消耗": "consumption",
                    "類別": "type", "效果": "effect"
                }
                for cn_field, en_field in field_map.items():
                    vals = field_data.get(cn_field, [])
                    if idx < len(vals) and vals[idx] and vals[idx] not in ("--", "--|", "【無】"):
                        item[en_field] = vals[idx]

                # Stat bonuses
                stats = {}
                stat_names = {"生命值": "hp", "元力值": "mp", "氣力值": "sp",
                              "攻擊力": "str", "防禦力": "def", "敏捷度": "agi"}
                for cn_stat, en_stat in stat_names.items():
                    vals = field_data.get(cn_stat, [])
                    if idx < len(vals) and vals[idx] and vals[idx].strip():
                        v = vals[idx].strip()
                        if v and v not in ("--",):
                            stats[en_stat] = v
                if stats:
                    item["stats"] = stats

                items_in_file.append(item)

        all_items[filename] = {
            "category": category,
            "items": items_in_file
        }
        print(f"  {filename}: {len(items_in_file)} items")

    return all_items


# ============================================================
# 5. Extract mission data
# ============================================================
def extract_missions():
    print("Extracting mission data...")
    mission_dir = os.path.join(ORIGINAL_DIR, "missionindex")
    missions = []

    for filepath in sorted(glob.glob(os.path.join(mission_dir, "m*.html"))):
        filename = os.path.basename(filepath).replace(".html", "")

        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        mission = {"id": filename}

        # Extract title from breadcrumb table
        tables = re.findall(r'<table[^>]*>(.*?)</table>', content, re.DOTALL)
        for table in tables[:3]:
            clean = re.sub(r'<[^>]+>', '\n', table)
            lines = [l.strip() for l in clean.split('\n') if l.strip()]
            for line in lines:
                m = re.search(r'(?:任務|故事)\d+\w*[- ]*([\u4e00-\u9fff][\u4e00-\u9fff\w]*)', line)
                if m:
                    mission["title"] = m.group(1).strip()
                    break
            if "title" in mission:
                break

        # Extract images
        imgs = extract_imgs(content)
        if imgs:
            mission["images"] = imgs[:5]

        missions.append(mission)

    print(f"  Extracted {len(missions)} missions")
    return missions


# ============================================================
# 6. Extract story data
# ============================================================
def extract_stories():
    print("Extracting story data...")
    story_dir = os.path.join(ORIGINAL_DIR, "storyindex")
    stories = []

    for filepath in sorted(glob.glob(os.path.join(story_dir, "*.html"))):
        filename = os.path.basename(filepath).replace(".html", "")
        # Patterns: s001_davis, s037, s005c_others, s20_main, s066b
        match = re.match(r's(\d+)([a-z]?)(?:_(.+))?', filename)
        if not match:
            continue

        arc_num = int(match.group(1))
        variant = match.group(2) or ""
        character = match.group(3) or ""

        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        story = {
            "id": filename,
            "arc": arc_num,
        }
        if variant:
            story["variant"] = variant
        if character:
            story["character"] = character

        # Extract title from breadcrumb - pattern: 故事NNN-TITLE
        tables = re.findall(r'<table[^>]*>(.*?)</table>', content, re.DOTALL)
        for table in tables[:3]:
            clean = re.sub(r'<[^>]+>', '\n', table)
            lines = [l.strip() for l in clean.split('\n') if l.strip()]
            for line in lines:
                m = re.search(r'故事\d+[- ]*([\u4e00-\u9fff\w（）\(\)]+)', line)
                if m:
                    story["title"] = m.group(1)
                    break
            if "title" in story:
                break

        # Extract character line info (e.g., 迪雲線)
        for table in tables[:3]:
            m = re.search(r'（([\u4e00-\u9fff]+線)）', table)
            if m:
                story["characterLine"] = m.group(1)
                break

        stories.append(story)

    print(f"  Extracted {len(stories)} stories")
    return stories


# ============================================================
# Main
# ============================================================
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. Character profiles
    profiles = extract_character_profiles()
    chars_path = os.path.join(OUTPUT_DIR, "characters.json")
    with open(chars_path, "r", encoding="utf-8") as f:
        existing = json.load(f)

    # 1b. Portrait groups
    portrait_groups = extract_portrait_groups()

    for char in existing["characters"]:
        slug = char["slug"]
        if slug in profiles:
            p = profiles[slug]
            for key in ["birthplace", "identity", "combatStyle", "weapon", "equipment", "skillNames"]:
                if p.get(key):
                    char[key] = p[key]
        if slug in portrait_groups:
            char["portraitGroups"] = portrait_groups[slug]

    with open(chars_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    print(f"Updated {chars_path}")

    # 2. Skills
    skills = extract_character_skills()
    with open(os.path.join(OUTPUT_DIR, "skills.json"), "w", encoding="utf-8") as f:
        json.dump(skills, f, ensure_ascii=False, indent=2)
    print(f"Saved skills.json")

    # 3. Beasts
    beasts = extract_beasts()
    with open(os.path.join(OUTPUT_DIR, "beasts.json"), "w", encoding="utf-8") as f:
        json.dump(beasts, f, ensure_ascii=False, indent=2)
    print(f"Saved beasts.json")

    # 3b. Transforms
    transforms = extract_transforms()
    with open(os.path.join(OUTPUT_DIR, "transforms.json"), "w", encoding="utf-8") as f:
        json.dump(transforms, f, ensure_ascii=False, indent=2)
    print(f"Saved transforms.json")

    # 4. Items
    items = extract_items()
    with open(os.path.join(OUTPUT_DIR, "items.json"), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)
    print(f"Saved items.json")

    # 5. Missions
    missions = extract_missions()
    with open(os.path.join(OUTPUT_DIR, "missions.json"), "w", encoding="utf-8") as f:
        json.dump(missions, f, ensure_ascii=False, indent=2)
    print(f"Saved missions.json")

    # 6. Stories
    stories = extract_stories()
    with open(os.path.join(OUTPUT_DIR, "stories.json"), "w", encoding="utf-8") as f:
        json.dump(stories, f, ensure_ascii=False, indent=2)
    print(f"Saved stories.json")

    # Print summary
    print("\n=== EXTRACTION SUMMARY ===")
    print(f"Characters: {len(profiles)} profiles extracted")
    total_skills = sum(len(s.get("skills", [])) for s in skills.values())
    stats_count = sum(1 for s in skills.values() if s.get("stats"))
    print(f"Skills: {total_skills} skills across {len(skills)} characters ({stats_count} with stats)")
    print(f"Beasts: {len(beasts)}")
    total_items = sum(len(v["items"]) for v in items.values())
    print(f"Items: {total_items} items")
    print(f"Missions: {len(missions)}")
    print(f"Stories: {len(stories)}")


if __name__ == "__main__":
    main()
