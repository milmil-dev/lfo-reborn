#!/usr/bin/env python3
"""Extract ALL images from mission and story pages for comic reader experience."""

import json
import os
import re
import glob

ORIGINAL_DIR = "/Users/niskan516/Downloads/lfostory-original/index2"
OUTPUT_DIR = "/Users/niskan516/Sync/Workspace/dev/web/lfo-wiki/data"


def fix_url(url):
    if not url.startswith("http"):
        url = "https://" + url.lstrip("./")
    url = url.replace("http://i.imgur.com", "https://i.imgur.com")
    return url


def extract_ordered_images(filepath):
    """Extract all imgur images from HTML in order of appearance, deduped."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Find all img src attributes with imgur URLs, in order
    imgs = re.findall(r'src="([^"]*imgur[^"]*?)"', content)

    # Fix URLs and dedupe while preserving order
    seen = set()
    result = []
    for url in imgs:
        url = fix_url(url)
        # Skip icon-sized images (typically < 100px wide)
        # Skip the common site header/nav images
        if url in seen:
            continue
        seen.add(url)
        result.append(url)

    # Filter: keep only .jpg, .png images (skip tiny icons that are .gif)
    # Actually we want to keep all since comic pages can be any format
    return result


def main():
    # ============================================================
    # 1. Mission images
    # ============================================================
    print("Extracting mission comic images...")
    mission_dir = os.path.join(ORIGINAL_DIR, "missionindex")
    missions_path = os.path.join(OUTPUT_DIR, "missions.json")

    with open(missions_path, "r", encoding="utf-8") as f:
        missions = json.load(f)

    mission_map = {m["id"]: m for m in missions}

    for filepath in sorted(glob.glob(os.path.join(mission_dir, "m*.html"))):
        slug = os.path.basename(filepath).replace(".html", "")
        images = extract_ordered_images(filepath)

        if slug in mission_map:
            mission_map[slug]["images"] = images
            print(f"  {slug}: {len(images)} images")

    # Write back
    missions = list(mission_map.values())
    with open(missions_path, "w", encoding="utf-8") as f:
        json.dump(missions, f, ensure_ascii=False, indent=2)
    print(f"Updated {missions_path}")

    total_mission_imgs = sum(len(m.get("images", [])) for m in missions)
    print(f"Total mission images: {total_mission_imgs}")

    # ============================================================
    # 2. Story images
    # ============================================================
    print("\nExtracting story comic images...")
    story_dir = os.path.join(ORIGINAL_DIR, "storyindex")
    stories_path = os.path.join(OUTPUT_DIR, "stories.json")

    with open(stories_path, "r", encoding="utf-8") as f:
        stories = json.load(f)

    story_map = {s["id"]: s for s in stories}

    for filepath in sorted(glob.glob(os.path.join(story_dir, "*.html"))):
        slug = os.path.basename(filepath).replace(".html", "")
        images = extract_ordered_images(filepath)

        if slug in story_map:
            story_map[slug]["images"] = images
            print(f"  {slug}: {len(images)} images")

    stories = list(story_map.values())
    with open(stories_path, "w", encoding="utf-8") as f:
        json.dump(stories, f, ensure_ascii=False, indent=2)
    print(f"Updated {stories_path}")

    total_story_imgs = sum(len(s.get("images", [])) for s in stories)
    print(f"Total story images: {total_story_imgs}")

    # ============================================================
    # 3. Also extract mission comic images from storyindex/s*ex files
    # ============================================================
    print("\nExtracting extra story files...")
    for filepath in sorted(glob.glob(os.path.join(mission_dir, "s*.html"))):
        slug = os.path.basename(filepath).replace(".html", "")
        images = extract_ordered_images(filepath)
        if slug not in story_map and images:
            stories.append({
                "id": slug,
                "arc": 0,
                "title": slug,
                "images": images
            })
            print(f"  {slug}: {len(images)} images (extra)")

    with open(stories_path, "w", encoding="utf-8") as f:
        json.dump(stories, f, ensure_ascii=False, indent=2)

    print(f"\n=== SUMMARY ===")
    print(f"Mission comic pages: {total_mission_imgs}")
    print(f"Story comic pages: {total_story_imgs}")


if __name__ == "__main__":
    main()
