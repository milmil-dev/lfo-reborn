#!/usr/bin/env python3
"""Extract all image/GIF URLs from original LFO website HTML files into JSON data."""

import json
import os
import re
import glob

ORIGINAL_DIR = "/Users/niskan516/Downloads/lfostory-original/index2"
OUTPUT_DIR = "/Users/niskan516/Sync/Workspace/dev/web/lfo-wiki/data"


def fix_url(url):
    """Fix relative imgur URLs to absolute."""
    if not url.startswith("http"):
        url = "https://" + url.lstrip("./")
    # Normalize
    url = url.replace("http://i.imgur.com", "https://i.imgur.com")
    return url


def extract_section(content, start_marker, end_markers):
    """Extract HTML between start marker and any of the end markers."""
    idx = content.find(start_marker)
    if idx < 0:
        return ""
    end_idx = len(content)
    for em in end_markers:
        ei = content.find(em, idx + len(start_marker))
        if 0 < ei < end_idx:
            end_idx = ei
    return content[idx:end_idx]


def extract_labeled_images(html):
    """Extract images with their text labels from HTML."""
    results = []
    pattern = r'<img[^>]*src="([^"]*imgur[^"]*?)"[^>]*>'
    for m in re.finditer(pattern, html):
        url = fix_url(m.group(1))
        # Get text after the image tag
        after = html[m.end():m.end() + 300]
        after_text = re.sub(r'<[^>]+>', ' ', after).strip()
        # Get first meaningful text (label)
        label = ""
        for word in after_text.split():
            if len(word) > 0 and not word.startswith("http"):
                label = word
                break
        results.append({"url": url, "label": label})
    return results


# ============================================================
# 1. Extract character images
# ============================================================
def extract_character_images():
    print("Extracting character images...")
    char_dir = os.path.join(ORIGINAL_DIR, "character")
    all_images = {}

    section_markers = ["角色簡介", "角色專用武器", "角色專用裝備",
                       "角色必殺技圖片", "角色基本動作", "角色型像及對話圖"]

    action_labels = ["普攻", "跑攻", "跳攻", "跑步", "滾動", "武器", "跳躍揮動武器"]

    for filepath in sorted(glob.glob(os.path.join(char_dir, "*.html"))):
        slug = os.path.basename(filepath).replace(".html", "")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        char_images = {}

        # --- Weapon image ---
        weapon_section = extract_section(content, "角色專用武器",
                                         ["角色專用裝備", "角色必殺技圖片", "角色基本動作"])
        weapon_imgs = re.findall(r'src="([^"]*imgur[^"]*?)"', weapon_section)
        if weapon_imgs:
            char_images["weaponImage"] = fix_url(weapon_imgs[0])

        # --- Equipment image ---
        equip_section = extract_section(content, "角色專用裝備",
                                        ["角色必殺技圖片", "角色基本動作"])
        equip_imgs = re.findall(r'src="([^"]*imgur[^"]*?)"', equip_section)
        if equip_imgs:
            char_images["equipmentImage"] = fix_url(equip_imgs[0])

        # --- Skill images (技能圖片) ---
        skill_section = extract_section(content, "角色必殺技圖片",
                                        ["角色基本動作"])
        if skill_section:
            # Also check for 查看詳細招式表 as alternative marker
            if not skill_section:
                skill_section = extract_section(content, "查看詳細招式表",
                                                ["角色基本動作"])

            skill_imgs = []
            for m in re.finditer(r'<img[^>]*src="([^"]*imgur[^"]*?)"[^>]*>', skill_section):
                url = fix_url(m.group(1))
                # Get skill name label
                after = skill_section[m.end():m.end() + 300]
                after_clean = re.sub(r'<img[^>]*>', '', after)
                after_text = re.sub(r'<[^>]+>', '\n', after_clean)
                lines = [l.strip() for l in after_text.split('\n') if l.strip()]
                label = lines[0] if lines else ""
                # Clean label - take first meaningful Chinese text
                label_match = re.match(r'([\u4e00-\u9fff]+)', label)
                if label_match:
                    label = label_match.group(1)
                skill_imgs.append({"url": url, "name": label})
            if skill_imgs:
                char_images["skillImages"] = skill_imgs

        # --- Action GIFs (基本動作) ---
        action_section = extract_section(content, "角色基本動作",
                                         ["角色型像及對話圖"])
        if action_section:
            action_gifs = []
            gif_pattern = r'<img[^>]*src="([^"]*imgur[^"]*?\.gif)"[^>]*>'
            for m in re.finditer(gif_pattern, action_section):
                url = fix_url(m.group(1))
                after = action_section[m.end():m.end() + 200]
                after_text = re.sub(r'<[^>]+>', ' ', after).strip()
                # Match action label
                label = ""
                for al in action_labels:
                    if al in after_text[:30]:
                        label = al
                        break
                if not label:
                    # Try to get first Chinese word
                    lm = re.search(r'([\u4e00-\u9fff]+)', after_text[:30])
                    if lm:
                        label = lm.group(1)
                action_gifs.append({"url": url, "label": label})

            # Also check for non-gif images (some are png)
            if not action_gifs:
                img_pattern = r'<img[^>]*src="([^"]*imgur[^"]*?)"[^>]*>'
                for m in re.finditer(img_pattern, action_section):
                    url = fix_url(m.group(1))
                    after = action_section[m.end():m.end() + 200]
                    after_text = re.sub(r'<[^>]+>', ' ', after).strip()
                    label = ""
                    for al in action_labels:
                        if al in after_text[:30]:
                            label = al
                            break
                    if not label:
                        lm = re.search(r'([\u4e00-\u9fff]+)', after_text[:30])
                        if lm:
                            label = lm.group(1)
                    action_gifs.append({"url": url, "label": label})

            if action_gifs:
                char_images["actionGifs"] = action_gifs

        # --- Portraits (型像圖) and Dialog images (對話圖) ---
        portrait_section = extract_section(content, "角色型像及對話圖", [])
        if portrait_section:
            portraits = []
            dialogs = []

            # Split into portrait rows and dialog rows
            # Portraits have labels like "一般型像", "小時候的XXX", "異轉XXX"
            # Dialogs are just sequential images

            # Find labeled portrait images
            # Pattern: image followed by Chinese text label, then dialog images
            img_pattern = r'<img[^>]*src="([^"]*imgur[^"]*?)"[^>]*>'
            all_portrait_imgs = list(re.finditer(img_pattern, portrait_section))

            in_dialog = False
            current_portrait_label = ""

            for i, m in enumerate(all_portrait_imgs):
                url = fix_url(m.group(1))
                after = portrait_section[m.end():m.end() + 300]
                after_text = re.sub(r'<[^>]+>', ' ', after).strip()

                # Check if this is a labeled portrait
                label_match = re.match(r'([\u4e00-\u9fff]+型像|小時候[\u4e00-\u9fff]*|異轉[\u4e00-\u9fff]*|[\u4e00-\u9fff]+變身)', after_text[:40])
                if label_match:
                    portraits.append({"url": url, "label": label_match.group(1)})
                    in_dialog = False
                elif "對話" in after_text[:20] or "相關對話圖" in after_text[:20]:
                    # Skip "相關對話圖" header text, this starts dialog section
                    in_dialog = True
                    dialogs.append(url)
                elif in_dialog or (i > 0 and url.endswith(".png") and len(after_text[:20].strip()) < 5):
                    # Sequential dialog images
                    dialogs.append(url)
                else:
                    # Check if near a portrait label area
                    before = portrait_section[max(0, m.start()-200):m.start()]
                    before_text = re.sub(r'<[^>]+>', ' ', before).strip()
                    if "型像圖片" in before_text or "相關對話" in before_text:
                        dialogs.append(url)
                    else:
                        # Default to dialog if no clear label
                        dialogs.append(url)

            if portraits:
                char_images["portraits"] = portraits
            if dialogs:
                char_images["dialogs"] = list(dict.fromkeys(dialogs))  # dedupe

        if char_images:
            all_images[slug] = char_images

    print(f"  Extracted images for {len(all_images)} characters")
    return all_images


# ============================================================
# 2. Extract skill dex images
# ============================================================
def extract_skill_images():
    print("Extracting skill dex images...")
    skills_dir = os.path.join(ORIGINAL_DIR, "dex", "skills_v2")
    all_skill_imgs = {}

    for filepath in sorted(glob.glob(os.path.join(skills_dir, "*.html"))):
        slug = os.path.basename(filepath).replace(".html", "")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        imgs = re.findall(r'src="([^"]*imgur[^"]*?)"', content)
        imgs = [fix_url(u) for u in imgs]
        imgs = list(dict.fromkeys(imgs))  # dedupe

        if imgs:
            all_skill_imgs[slug] = imgs

    print(f"  Extracted skill images for {len(all_skill_imgs)} characters")
    return all_skill_imgs


# ============================================================
# 3. Extract beast images
# ============================================================
def extract_beast_images():
    print("Extracting beast images...")
    beast_dir = os.path.join(ORIGINAL_DIR, "beast")
    all_beast_imgs = {}

    for filepath in sorted(glob.glob(os.path.join(beast_dir, "*.html"))):
        slug = os.path.basename(filepath).replace(".html", "")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        imgs = re.findall(r'src="([^"]*imgur[^"]*?)"', content)
        imgs = [fix_url(u) for u in imgs]
        imgs = list(dict.fromkeys(imgs))

        if imgs:
            all_beast_imgs[slug] = imgs

    print(f"  Extracted beast images for {len(all_beast_imgs)} beasts")
    return all_beast_imgs


# ============================================================
# 4. Extract item images
# ============================================================
def extract_item_images():
    print("Extracting item images...")
    items_dir = os.path.join(ORIGINAL_DIR, "items")
    all_item_imgs = {}

    for filepath in sorted(glob.glob(os.path.join(items_dir, "*.html"))):
        if os.path.getsize(filepath) == 0:
            continue
        slug = os.path.basename(filepath).replace(".html", "")
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        imgs = re.findall(r'src="([^"]*imgur[^"]*?)"', content)
        imgs = [fix_url(u) for u in imgs]
        imgs = list(dict.fromkeys(imgs))

        if imgs:
            all_item_imgs[slug] = imgs

    print(f"  Extracted item images for {len(all_item_imgs)} categories")
    return all_item_imgs


# ============================================================
# Main
# ============================================================
def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. Character images (structured)
    char_images = extract_character_images()

    # Merge into characters.json
    chars_path = os.path.join(OUTPUT_DIR, "characters.json")
    with open(chars_path, "r", encoding="utf-8") as f:
        existing = json.load(f)

    for char in existing["characters"]:
        slug = char["slug"]
        if slug in char_images:
            imgs = char_images[slug]
            if imgs.get("weaponImage"):
                char["weaponImage"] = imgs["weaponImage"]
            if imgs.get("equipmentImage"):
                char["equipmentImage"] = imgs["equipmentImage"]
            if imgs.get("skillImages"):
                char["skillImages"] = imgs["skillImages"]
            if imgs.get("actionGifs"):
                char["actionGifs"] = imgs["actionGifs"]
            if imgs.get("portraits"):
                char["portraits"] = imgs["portraits"]
            if imgs.get("dialogs"):
                char["dialogs"] = imgs["dialogs"]

    with open(chars_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    print(f"Updated {chars_path} with images")

    # 2. Skill dex images - merge into skills.json
    skill_imgs = extract_skill_images()
    skills_path = os.path.join(OUTPUT_DIR, "skills.json")
    with open(skills_path, "r", encoding="utf-8") as f:
        skills_data = json.load(f)

    for slug, imgs in skill_imgs.items():
        if slug in skills_data:
            skills_data[slug]["images"] = imgs

    with open(skills_path, "w", encoding="utf-8") as f:
        json.dump(skills_data, f, ensure_ascii=False, indent=2)
    print(f"Updated {skills_path} with images")

    # 3. Beast images - merge into beasts.json
    beast_imgs = extract_beast_images()
    beasts_path = os.path.join(OUTPUT_DIR, "beasts.json")
    with open(beasts_path, "r", encoding="utf-8") as f:
        beasts_data = json.load(f)

    for slug, imgs in beast_imgs.items():
        if slug in beasts_data:
            beasts_data[slug]["images"] = imgs

    with open(beasts_path, "w", encoding="utf-8") as f:
        json.dump(beasts_data, f, ensure_ascii=False, indent=2)
    print(f"Updated {beasts_path} with images")

    # 4. Item images - save separately (too many to merge per-item)
    item_imgs_path = os.path.join(OUTPUT_DIR, "item-images.json")
    item_imgs = extract_item_images()
    with open(item_imgs_path, "w", encoding="utf-8") as f:
        json.dump(item_imgs, f, ensure_ascii=False, indent=2)
    print(f"Saved {item_imgs_path}")

    # Print summary
    print("\n=== IMAGE EXTRACTION SUMMARY ===")
    total_char_imgs = 0
    for slug, imgs in char_images.items():
        total_char_imgs += len(imgs.get("skillImages", []))
        total_char_imgs += len(imgs.get("actionGifs", []))
        total_char_imgs += len(imgs.get("portraits", []))
        total_char_imgs += len(imgs.get("dialogs", []))
        total_char_imgs += 1 if imgs.get("weaponImage") else 0
        total_char_imgs += 1 if imgs.get("equipmentImage") else 0

    print(f"Character images: {total_char_imgs} across {len(char_images)} characters")
    print(f"  Skill images: {sum(len(imgs.get('skillImages', [])) for imgs in char_images.values())}")
    print(f"  Action GIFs: {sum(len(imgs.get('actionGifs', [])) for imgs in char_images.values())}")
    print(f"  Portraits: {sum(len(imgs.get('portraits', [])) for imgs in char_images.values())}")
    print(f"  Dialog images: {sum(len(imgs.get('dialogs', [])) for imgs in char_images.values())}")
    print(f"  Weapon images: {sum(1 for imgs in char_images.values() if imgs.get('weaponImage'))}")
    print(f"  Equipment images: {sum(1 for imgs in char_images.values() if imgs.get('equipmentImage'))}")

    total_skill_imgs = sum(len(v) for v in skill_imgs.values())
    print(f"Skill dex images: {total_skill_imgs} across {len(skill_imgs)} characters")

    total_beast_imgs = sum(len(v) for v in beast_imgs.values())
    print(f"Beast images: {total_beast_imgs} across {len(beast_imgs)} beasts")

    total_item_imgs = sum(len(v) for v in item_imgs.values())
    print(f"Item images: {total_item_imgs} across {len(item_imgs)} categories")


if __name__ == "__main__":
    main()
