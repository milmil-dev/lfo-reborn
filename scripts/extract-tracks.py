#!/usr/bin/env python3
"""Extract BGM track listing from archive.org into tracks.json."""

import json
import re
import urllib.request

URL = "https://archive.org/download/lfo_song/"
OUTPUT = "data/tracks.json"


def main():
    with urllib.request.urlopen(URL) as resp:
        html = resp.read().decode("utf-8")

    ogg_files = sorted(set(re.findall(r'href="([^"]+\.ogg)"', html)))

    tracks = []
    for filename in ogg_files:
        track_id = filename.replace(".ogg", "")
        title = track_id.replace("_", " ")
        tracks.append({
            "id": track_id,
            "title": title,
            "src": f"https://archive.org/download/lfo_song/{filename}",
            "srcFallback": f"https://archive.org/download/lfo_song/{track_id}.mp3",
        })

    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(tracks, f, ensure_ascii=False, indent=2)

    print(f"Extracted {len(tracks)} tracks to {OUTPUT}")


if __name__ == "__main__":
    main()
