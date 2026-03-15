# Media Player Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating music player (92 BGM tracks from archive.org) and inline video player to the LFO Wiki using Video.js v10.

**Architecture:** Video.js v10 (beta) as the playback engine for both audio and video. Custom React + motion UI for the floating music card. Video.js native skin for inline video. Zustand store for persistent state. Character accent color theming via existing CSS variables.

**Tech Stack:** Video.js v10, React 19, motion (Framer Motion), Zustand 5, Tailwind CSS v4, lite-youtube-embed, Bun

**Spec:** `docs/superpowers/specs/2026-03-15-media-player-design.md`

---

## Chunk 1: Foundation (Data + Store + Dependencies)

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Video.js v10 beta + lite-youtube-embed**

```bash
bun add video.js@next lite-youtube-embed
```

Note: `video.js@next` installs the v10 beta. If unavailable, use `video.js@latest` (v8) and note for CSS fallback.

- [ ] **Step 2: Verify installation and JSON import support**

```bash
bun run --bun -e "const vjs = require('video.js'); console.log('video.js version:', vjs.VERSION || 'installed')"
```

Also verify `@/data/*.json` imports work (the project already imports `@/data/transforms.json` in `components/character-stand-card.tsx`, so the alias and JSON imports are confirmed working).

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "deps: add video.js and lite-youtube-embed"
```

### Task 2: Extract tracks from archive.org

**Files:**
- Create: `scripts/extract-tracks.py`
- Create: `data/tracks.json`

- [ ] **Step 1: Write extraction script**

```python
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

    # Extract .ogg filenames from the directory listing
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
```

- [ ] **Step 2: Run extraction**

```bash
python3 scripts/extract-tracks.py
```

Expected: `Extracted 92 tracks to data/tracks.json` (count may vary)

- [ ] **Step 3: Verify JSON structure**

```bash
bun run --bun -e "const t = require('./data/tracks.json'); console.log('Tracks:', t.length); console.log('First:', JSON.stringify(t[0], null, 2))"
```

Expected: Array of objects with `id`, `title`, `src`, `srcFallback` fields.

- [ ] **Step 4: Commit**

```bash
git add scripts/extract-tracks.py data/tracks.json
git commit -m "feat: extract 92 BGM tracks from archive.org"
```

### Task 3: Create media store

**Files:**
- Create: `lib/media-store.ts`
- Reference: `lib/store.ts` (existing Zustand pattern, lines 23-58)

- [ ] **Step 1: Write the media store**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import tracksData from "@/data/tracks.json";

export interface Track {
  id: string;
  title: string;
  src: string;
  srcFallback: string;
}

interface MediaState {
  playlist: Track[];
  currentTrackIndex: number;
  isPlaying: boolean;
  isBuffering: boolean;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
  currentTime: number;
  duration: number;
  playerState: "fab" | "card" | "playlist";
  themeColor: string;
  videoPlayingCount: number;
  musicWasPlayingBeforeVideo: boolean;
  errorCount: number; // consecutive load errors for auto-skip logic
  errorMessage: string | null; // shown briefly in card UI on per-track errors
}

interface MediaActions {
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek: (time: number) => void;
  setTrack: (index: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setPlayerState: (state: "fab" | "card" | "playlist") => void;
  setThemeColor: (color: string) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsBuffering: (buffering: boolean) => void;
  onTrackError: () => void;
  onVideoPlay: () => void;
  onVideoPause: () => void;
}

// Module-scoped ref for Video.js audio instance — singleton, never destroyed
let audioPlayer: any = null;

export function setAudioPlayer(player: any) {
  audioPlayer = player;
}

export function getAudioPlayer() {
  return audioPlayer;
}

export const useMediaStore = create<MediaState & MediaActions>()(
  persist(
    (set, get) => ({
      playlist: tracksData as Track[],
      currentTrackIndex: 0,
      isPlaying: false,
      isBuffering: false,
      volume: 0.7,
      isMuted: false,
      shuffle: false,
      repeat: "none" as const,
      currentTime: 0,
      duration: 0,
      playerState: "fab" as const,
      themeColor: "#ffbf00",
      videoPlayingCount: 0,
      musicWasPlayingBeforeVideo: false,
      errorCount: 0,
      errorMessage: null,

      play: () => {
        audioPlayer?.play();
        set({ isPlaying: true, errorCount: 0 });
      },
      pause: () => {
        audioPlayer?.pause();
        set({ isPlaying: false });
      },
      next: () => {
        const { playlist, currentTrackIndex, shuffle, repeat } = get();
        let nextIndex: number;
        if (shuffle) {
          nextIndex = Math.floor(Math.random() * playlist.length);
        } else if (currentTrackIndex >= playlist.length - 1) {
          nextIndex = repeat === "all" ? 0 : currentTrackIndex;
          if (repeat === "none") {
            set({ isPlaying: false });
            return;
          }
        } else {
          nextIndex = currentTrackIndex + 1;
        }
        const track = playlist[nextIndex];
        if (track && audioPlayer) {
          audioPlayer.src([
            { src: track.src, type: "audio/ogg" },
            { src: track.srcFallback, type: "audio/mpeg" },
          ]);
          audioPlayer.play();
          set({ currentTrackIndex: nextIndex, isPlaying: true, currentTime: 0, errorCount: 0 });
        }
      },
      prev: () => {
        const { playlist, currentTrackIndex, currentTime } = get();
        if (currentTime > 3) {
          audioPlayer?.currentTime(0);
          set({ currentTime: 0 });
          return;
        }
        const prevIndex = currentTrackIndex > 0 ? currentTrackIndex - 1 : playlist.length - 1;
        const track = playlist[prevIndex];
        if (track && audioPlayer) {
          audioPlayer.src([
            { src: track.src, type: "audio/ogg" },
            { src: track.srcFallback, type: "audio/mpeg" },
          ]);
          audioPlayer.play();
          set({ currentTrackIndex: prevIndex, isPlaying: true, currentTime: 0, errorCount: 0 });
        }
      },
      seek: (time: number) => {
        audioPlayer?.currentTime(time);
        set({ currentTime: time });
      },
      setTrack: (index: number) => {
        const { playlist } = get();
        const track = playlist[index];
        if (track && audioPlayer) {
          audioPlayer.src([
            { src: track.src, type: "audio/ogg" },
            { src: track.srcFallback, type: "audio/mpeg" },
          ]);
          audioPlayer.play();
          set({ currentTrackIndex: index, isPlaying: true, currentTime: 0, errorCount: 0 });
        }
      },
      setVolume: (vol: number) => {
        audioPlayer?.volume(vol);
        set({ volume: vol, isMuted: vol === 0 });
      },
      toggleMute: () => {
        const muted = !get().isMuted;
        audioPlayer?.muted(muted);
        set({ isMuted: muted });
      },
      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
      toggleRepeat: () =>
        set((s) => ({
          repeat: s.repeat === "none" ? "all" : s.repeat === "all" ? "one" : "none",
        })),
      setPlayerState: (state) => set({ playerState: state }),
      setThemeColor: (color) => set({ themeColor: color }),
      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setIsBuffering: (buffering) => set({ isBuffering: buffering }),
      onTrackError: () => {
        const { errorCount, playlist, currentTrackIndex } = get();
        const newCount = errorCount + 1;
        // Show brief error message in the card UI (auto-clears after 3s)
        const trackName = playlist[currentTrackIndex]?.title ?? "";
        set({ errorMessage: `無法載入音樂: ${trackName}` });
        setTimeout(() => set({ errorMessage: null }), 3000);

        if (newCount >= playlist.length) {
          // All tracks failed — stop trying, show persistent error state
          set({ errorCount: newCount, isPlaying: false, isBuffering: false });
          return;
        }
        set({ errorCount: newCount });
        // Auto-skip to next track after 2s
        setTimeout(() => get().next(), 2000);
      },
      onVideoPlay: () => {
        const { isPlaying, videoPlayingCount } = get();
        if (videoPlayingCount === 0 && isPlaying) {
          audioPlayer?.pause();
          set({ musicWasPlayingBeforeVideo: true, isPlaying: false });
        }
        set((s) => ({ videoPlayingCount: s.videoPlayingCount + 1 }));
      },
      onVideoPause: () => {
        const newCount = Math.max(0, get().videoPlayingCount - 1);
        set({ videoPlayingCount: newCount });
        if (newCount === 0 && get().musicWasPlayingBeforeVideo) {
          audioPlayer?.play();
          set({ isPlaying: true, musicWasPlayingBeforeVideo: false });
        }
      },
    }),
    {
      name: "lfo-media-store",
      version: 1,
      partialize: (state) => ({
        currentTrackIndex: state.currentTrackIndex,
        volume: state.volume,
        isMuted: state.isMuted,
        shuffle: state.shuffle,
        repeat: state.repeat,
        playerState: state.playerState,
      }),
    },
  ),
);
```

- [ ] **Step 2: Commit**

```bash
git add lib/media-store.ts
git commit -m "feat: add Zustand media store with playback and error handling"
```

### Task 4: Create Video.js CSS overrides

**Files:**
- Create: `styles/videojs-wiki.css`
- Modify: `styles/app.css:3` (add import after fumadocs import)

- [ ] **Step 1: Write CSS overrides**

Create `styles/videojs-wiki.css`. Note: import `video-js.css` here (not in `app.css`) to keep Video.js styles scoped and avoid global reset conflicts with Tailwind/fumadocs:

```css
/* Video.js wiki theme — import base + minimal overrides */
@import "video.js/dist/video-js.css";

.video-js.vjs-wiki {
  border-radius: 2rem;
  overflow: hidden;
  border: 1px solid oklch(0.28 0.008 265 / 0.4);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  font-family: "Noto Sans TC", system-ui, sans-serif;
}

.video-js.vjs-wiki .vjs-play-progress,
.video-js.vjs-wiki .vjs-volume-level {
  background: var(--media-accent, #ffbf00);
}

.video-js.vjs-wiki .vjs-play-progress .vjs-time-tooltip {
  background: var(--media-accent, #ffbf00);
}
```

- [ ] **Step 2: Import in app.css**

In `styles/app.css`, add after line 3 (`@import "fumadocs-ui/style.css";`):

```css
@import "./videojs-wiki.css";
```

- [ ] **Step 3: Commit**

```bash
git add styles/videojs-wiki.css styles/app.css
git commit -m "style: add Video.js wiki theme CSS overrides"
```

---

## Chunk 2: Music Player Component

### Task 5: Video.js audio engine initialization

**Files:**
- Create: `components/music-player.tsx` (initial skeleton)
- Modify: `routes/__root.tsx:75` (add MusicPlayer inside `<RootProvider>`, after `<ImageLightbox />`)

- [ ] **Step 1: Create music-player.tsx with engine init only**

Create `components/music-player.tsx`. This step only wires up the Video.js audio engine — no UI yet beyond a hidden audio element and a temporary play button for testing:

```tsx
import { useEffect, useRef } from "react";
import { useMediaStore, setAudioPlayer } from "@/lib/media-store";

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const initialized = useRef(false);
  const store = useMediaStore();

  useEffect(() => {
    if (initialized.current || !audioRef.current) return;
    initialized.current = true;

    import("video.js").then(({ default: videojs }) => {
      const player = videojs(audioRef.current!, {
        controls: false,
        autoplay: false,
        preload: "none",
      });

      setAudioPlayer(player);

      // Restore persisted volume
      player.volume(useMediaStore.getState().volume);
      player.muted(useMediaStore.getState().isMuted);

      // Sync events to store
      player.on("timeupdate", () => {
        useMediaStore.getState().setCurrentTime(player.currentTime() ?? 0);
      });
      player.on("loadedmetadata", () => {
        useMediaStore.getState().setDuration(player.duration() ?? 0);
      });
      player.on("ended", () => {
        const { repeat } = useMediaStore.getState();
        if (repeat === "one") {
          player.currentTime(0);
          player.play();
        } else {
          useMediaStore.getState().next();
        }
      });
      player.on("waiting", () => useMediaStore.getState().setIsBuffering(true));
      player.on("playing", () => useMediaStore.getState().setIsBuffering(false));
      player.on("error", () => useMediaStore.getState().onTrackError());

      // Load first track (don't autoplay)
      const { playlist, currentTrackIndex } = useMediaStore.getState();
      const track = playlist[currentTrackIndex];
      if (track) {
        player.src([
          { src: track.src, type: "audio/ogg" },
          { src: track.srcFallback, type: "audio/mpeg" },
        ]);
      }
    });
  }, []);

  return (
    <>
      <audio ref={audioRef} style={{ display: "none" }} />
      {/* Temporary test button — will be replaced by full UI in next tasks */}
      <button
        type="button"
        onClick={() => (store.isPlaying ? store.pause() : store.play())}
        style={{ position: "fixed", bottom: 16, right: 16, zIndex: 9999, padding: "8px 16px", background: "#ffbf00", borderRadius: 8, color: "#000", fontWeight: "bold" }}
      >
        {store.isPlaying ? "⏸" : "▶"} {store.playlist[store.currentTrackIndex]?.title}
      </button>
    </>
  );
}
```

- [ ] **Step 2: Add MusicPlayer to root layout**

In `routes/__root.tsx`, inside `<RootProvider>` after `<ImageLightbox />` (line 75):

```tsx
import { MusicPlayer } from "@/components/music-player";
```

Change lines 73-76 from:
```tsx
<RootProvider theme={{ defaultTheme: "system" }}>
  <Outlet />
  <ImageLightbox />
</RootProvider>
```
to:
```tsx
<RootProvider theme={{ defaultTheme: "system" }}>
  <Outlet />
  <ImageLightbox />
  <MusicPlayer />
</RootProvider>
```

- [ ] **Step 3: Test audio engine**

```bash
bun run dev
```

Open site. Click the temporary yellow play button. Audio should play from archive.org. Click again to pause. Check browser console for errors.

- [ ] **Step 4: Commit**

```bash
git add components/music-player.tsx routes/__root.tsx
git commit -m "feat: wire up Video.js audio engine with Zustand store"
```

### Task 6: Build FAB state UI

**Files:**
- Modify: `components/music-player.tsx`

- [ ] **Step 1: Replace temp button with FAB**

Replace the temporary test button with the FAB UI:
- 56px `motion.div` with `drag`, `dragConstraints` (viewport ref), `dragElastic={0.1}`
- On `dragEnd`: calculate nearest corner, `animate` to that position via motion `controls`
- Circular progress ring: SVG `<circle>` with `strokeDasharray` driven by `currentTime / duration`
- Center: music note icon from lucide-react (`Music`)
- Click handler: `setPlayerState("card")`
- Only renders when `playerState === "fab"`
- All interactive elements have `aria-label` attributes (e.g., `aria-label="展開音樂播放器"`)

- [ ] **Step 2: Test FAB**

Verify: FAB appears bottom-right, shows progress ring, draggable and snaps to corners, click opens card state (card state is empty for now — just test the transition).

- [ ] **Step 3: Commit**

```bash
git add components/music-player.tsx
git commit -m "feat: add music player FAB with drag-to-corner"
```

### Task 7: Build Card state UI

**Files:**
- Modify: `components/music-player.tsx`

- [ ] **Step 1: Build card layout**

When `playerState === "card"`, render a `motion.div` card:
- Fixed position bottom-right, `w-[420px]`
- Glassmorphism: `bg-[rgba(20,16,32,0.92)] backdrop-blur-xl border border-white/[0.08] rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,0.5)]`
- Left side: 180×200px album art area with LFO text + waveform bars (array of `motion.div` bars animated with `isPlaying`)
- Right side column:
  - Track title (`text-white font-bold`) + "LFO BGM" subtitle
  - Progress scrubber: `<input type="range" min={0} max={duration} value={currentTime}>` styled with accent color, `onChange` → `seek()`
  - Timestamps: `currentTime` / `-remaining`
  - Control row: `SkipBack` + `Play`/`Pause` (large, white circle bg) + `SkipForward`
  - Bottom row: `Shuffle` + `Repeat` toggles (left), volume slider + `ListMusic` toggle (right)
- Minimize button (top-right): click → `setPlayerState("fab")`
- `AnimatePresence` wrapping FAB and Card for transition

All buttons must have `aria-label`:
- Play: `aria-label="播放"`, Pause: `aria-label="暫停"`
- SkipBack: `aria-label="上一曲"`, SkipForward: `aria-label="下一曲"`
- Shuffle: `aria-label="隨機播放"`, Repeat: `aria-label="循環播放"`
- Volume: `aria-label="音量"`, ListMusic: `aria-label="播放清單"`
- Minimize: `aria-label="最小化"`

- [ ] **Step 2: Apply accent color**

Set CSS variable `--media-accent` on the card container from `themeColor` state. Use it for: progress bar fill, play button glow, active toggle highlight.

- [ ] **Step 3: Add error state display**

When `errorMessage` is not null, show a brief notification banner at the top of the card: red-tinted `bg-red-500/10 text-red-400 text-xs px-3 py-1.5 rounded-lg` displaying the error message. Uses `AnimatePresence` to fade in/out (auto-clears after 3s via store).

When `errorCount >= playlist.length`, show a persistent error overlay in the card: "無法載入音樂" text + retry button that resets `errorCount` to 0 and calls `play()`.

When `isBuffering`, show a pulsing animation on progress bar and replace play icon with a spinner (lucide `Loader2` with `animate-spin`).

- [ ] **Step 4: Test card**

Click FAB → card appears. Play/pause/next/prev/seek/volume all work. Accent color applied. Minimize goes back to FAB.

- [ ] **Step 5: Commit**

```bash
git add components/music-player.tsx
git commit -m "feat: add music player card UI with controls and error states"
```

### Task 8: Add playlist drawer

**Files:**
- Modify: `components/music-player.tsx`

- [ ] **Step 1: Build playlist state**

When `playerState === "playlist"`:
- Card header compresses to compact row: 36px album art, title, mini progress bar, play/pause + prev/next (smaller buttons)
- Below: `motion.div` with `initial={{ height: 0 }} animate={{ height: "auto" }}` spring transition
- Scrollable track list (max-height: 280px, `overflow-y: auto`)
- Active track: `bg-[themeColor]/10` highlight, animated equalizer icon (3 bars)
- Each row: track index, title, duration (right-aligned, muted text), `onClick` → `setTrack(index)`
- Bottom fade: `sticky bottom-0` gradient `from-transparent to-[rgba(20,16,32,0.95)]`
- Toggle: `ListMusic` button cycles card ↔ playlist

- [ ] **Step 2: Add keyboard shortcuts**

Add `useEffect` with `keydown` listener:

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    const editable = (e.target as HTMLElement)?.isContentEditable;
    if (tag === "INPUT" || tag === "TEXTAREA" || editable) return;

    const { isPlaying, volume, play, pause, seek, currentTime, setVolume, next, prev, playerState, setPlayerState } = useMediaStore.getState();
    switch (e.key) {
      case " ": e.preventDefault(); isPlaying ? pause() : play(); break;
      case "ArrowLeft": e.preventDefault(); seek(Math.max(0, currentTime - 5)); break;
      case "ArrowRight": e.preventDefault(); seek(currentTime + 5); break;
      case "ArrowUp": e.preventDefault(); setVolume(Math.min(1, volume + 0.1)); break;
      case "ArrowDown": e.preventDefault(); setVolume(Math.max(0, volume - 0.1)); break;
      case "l": case "L": setPlayerState(playerState === "playlist" ? "card" : "playlist"); break;
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []);
```

- [ ] **Step 3: Test playlist**

Toggle playlist open/close. Click tracks. Keyboard shortcuts work (verify they don't fire in search input). Active track highlighted.

- [ ] **Step 4: Commit**

```bash
git add components/music-player.tsx
git commit -m "feat: add playlist drawer and keyboard shortcuts"
```

### Task 9: Character accent color sync

**Files:**
- Modify: `components/music-player.tsx`

- [ ] **Step 1: Add theme color sync**

Add to `MusicPlayer` component. Use `MutationObserver` on `<html>` element's style attribute to detect when `useCharacterTheme` updates the CSS variable — this is more reliable than a timer:

```tsx
import { useLocation } from "@tanstack/react-router";

const location = useLocation();
const setThemeColor = useMediaStore((s) => s.setThemeColor);

useEffect(() => {
  const readColor = () => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-fd-primary").trim();
    setThemeColor(raw || "#ffbf00");
  };

  // Read immediately + observe for changes
  readColor();
  const observer = new MutationObserver(readColor);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  return () => observer.disconnect();
}, [location.pathname, setThemeColor]);
```

- [ ] **Step 2: Test**

Navigate to `/docs/character/freeze` → player accent turns blue. `/docs/character/firen` → red. Non-character page → amber.

- [ ] **Step 3: Commit**

```bash
git add components/music-player.tsx
git commit -m "feat: sync music player accent with character theme color"
```

---

## Chunk 3: Video Player Component

### Task 10: Build inline VideoPlayer

**Files:**
- Create: `components/video-player.tsx`
- Modify: `components/mdx.tsx:11` (add VideoPlayer to getMDXComponents)

- [ ] **Step 1: Create video-player.tsx**

```tsx
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { useMediaStore } from "@/lib/media-store";

// Register lite-youtube-embed custom element
import "lite-youtube-embed";
import "lite-youtube-embed/src/lite-yt-embed.css";

interface VideoPlayerProps {
  src: string;
  title?: string;
  poster?: string;
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  return m?.[1] ?? null;
}

function extractBilibiliId(url: string): string | null {
  const m = url.match(/bilibili\.com\/video\/(BV\w+)/);
  return m?.[1] ?? null;
}

export function VideoPlayer({ src, title, poster }: VideoPlayerProps) {
  const [activated, setActivated] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const themeColor = useMediaStore((s) => s.themeColor);
  const onVideoPlay = useMediaStore((s) => s.onVideoPlay);
  const onVideoPause = useMediaStore((s) => s.onVideoPause);

  const youtubeId = extractYouTubeId(src);
  const bilibiliId = extractBilibiliId(src);

  // Cleanup Video.js on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        onVideoPause(); // decrement count on unmount
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [onVideoPause]);

  // Init Video.js when activated
  useEffect(() => {
    if (!activated || !videoRef.current || playerRef.current) return;

    import("video.js").then(({ default: videojs }) => {
      const player = videojs(videoRef.current!, {
        controls: true,
        autoplay: true,
        preload: "auto",
        fluid: true,
        aspectRatio: "16:9",
      });
      playerRef.current = player;
      player.addClass("vjs-wiki");

      player.on("play", onVideoPlay);
      player.on("pause", onVideoPause);
      player.on("ended", onVideoPause);
    });
  }, [activated, onVideoPlay, onVideoPause]);

  // YouTube embed
  if (youtubeId) {
    return (
      <div className="my-4">
        <div className="overflow-hidden rounded-[2rem] border border-fd-border/40 shadow-lg" style={{ "--media-accent": themeColor } as React.CSSProperties}>
          <lite-youtube videoid={youtubeId} playlabel={title ?? "Play video"} />
        </div>
        {title && <p className="mt-2 text-sm text-fd-muted-foreground">{title}</p>}
      </div>
    );
  }

  // Bilibili embed
  if (bilibiliId) {
    return (
      <div className="my-4">
        <div className="aspect-video overflow-hidden rounded-[2rem] border border-fd-border/40 shadow-lg">
          <iframe
            src={`https://player.bilibili.com/player.html?bvid=${bilibiliId}&autoplay=0`}
            className="h-full w-full"
            allowFullScreen
            title={title ?? "Bilibili video"}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
        {title && <p className="mt-2 text-sm text-fd-muted-foreground">{title}</p>}
        <p className="mt-1 text-xs text-fd-muted-foreground/50">
          <a href={src} target="_blank" rel="noopener noreferrer">在Bilibili上觀看</a>
        </p>
      </div>
    );
  }

  // Direct video — lazy load Video.js on play
  return (
    <div className="my-4">
      <div
        className="relative overflow-hidden rounded-[2rem] border border-fd-border/40 shadow-lg"
        style={{ "--media-accent": themeColor } as React.CSSProperties}
      >
        {!activated ? (
          <div
            className="relative aspect-video cursor-pointer bg-black"
            onClick={() => setActivated(true)}
          >
            {poster && <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 backdrop-blur-sm">
                <Play className="h-6 w-6 text-white" fill="white" />
              </div>
            </div>
          </div>
        ) : (
          <div data-vjs-player>
            <video ref={videoRef} className="video-js vjs-wiki" playsInline>
              <source src={src} />
            </video>
          </div>
        )}
      </div>
      {title && <p className="mt-2 text-sm text-fd-muted-foreground">{title}</p>}
    </div>
  );
}

// Type declaration for lite-youtube-embed custom element
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "lite-youtube": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        videoid: string;
        playlabel?: string;
      }, HTMLElement>;
    }
  }
}
```

- [ ] **Step 2: Register in MDX components**

In `components/mdx.tsx`, add import and register. Change lines 6-13 from:

```tsx
export function getMDXComponents(components?: MDXComponents) {
	return {
		...defaultMdxComponents,
		CharacterGrid,
		TimelineWrapper,
		TimelineSection,
		...components,
	} satisfies MDXComponents;
}
```

to:

```tsx
export function getMDXComponents(components?: MDXComponents) {
	return {
		...defaultMdxComponents,
		CharacterGrid,
		TimelineWrapper,
		TimelineSection,
		VideoPlayer,
		...components,
	} satisfies MDXComponents;
}
```

And add import at top:

```tsx
import { VideoPlayer } from "./video-player";
```

- [ ] **Step 3: Test with sample MDX**

Add temporarily to any MDX file:

```mdx
<VideoPlayer src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" title="Test" />
```

Verify YouTube embed renders with rounded styling. Remove test content after.

- [ ] **Step 4: Commit**

```bash
git add components/video-player.tsx components/mdx.tsx
git commit -m "feat: add inline VideoPlayer MDX component"
```

---

## Chunk 4: Polish & Mobile

### Task 11: Mobile responsiveness

**Files:**
- Modify: `components/music-player.tsx`

- [ ] **Step 1: Add responsive breakpoints**

- Card: below `sm` (640px), set `w-[calc(100vw-32px)]` and center horizontally (bottom center instead of bottom-right)
- Playlist: `max-h-[50vh]` on mobile
- Volume slider: replace with mute toggle only on mobile (use Tailwind `hidden sm:flex` on volume slider, show `sm:hidden` on mute-only button)
- Font sizes: reduce title to `text-sm` on mobile
- Touch targets: ensure all buttons are min 44×44px

- [ ] **Step 2: Test on mobile viewport**

Dev tools → 375px width. FAB, card, playlist all render correctly. Controls are tappable.

- [ ] **Step 3: Commit**

```bash
git add components/music-player.tsx
git commit -m "style: responsive music player for mobile"
```

### Task 12: Reduced motion support

**Files:**
- Modify: `components/music-player.tsx`

Note: `styles/app.css` already has a global `@media (prefers-reduced-motion: reduce)` rule that zeroes CSS animation/transition durations. For motion (Framer Motion) JS animations, we need an explicit check. No changes needed for `video-player.tsx` — Video.js respects the CSS media query automatically.

- [ ] **Step 1: Add reduced motion check to music player**

```tsx
const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

When `prefersReducedMotion`:
- All `motion.div` transitions: `transition={{ duration: 0 }}`
- Waveform bars: static heights (no animation)
- FAB drag disabled (click only to toggle states)
- `AnimatePresence` transitions: instant

- [ ] **Step 2: Commit**

```bash
git add components/music-player.tsx
git commit -m "a11y: respect prefers-reduced-motion in music player"
```

### Task 13: Final integration test

- [ ] **Step 1: Full manual test checklist**

- [ ] Music player FAB appears on page load
- [ ] Click FAB → card expands with animation
- [ ] Click play → first track plays from archive.org
- [ ] Progress bar updates in real-time
- [ ] Next/prev track works
- [ ] Shuffle/repeat toggles work
- [ ] Volume slider works
- [ ] Playlist opens with track list
- [ ] Click a track in playlist → plays that track
- [ ] Navigate between pages → music continues playing
- [ ] On character page → accent color changes
- [ ] `<VideoPlayer>` renders in MDX content (YouTube embed)
- [ ] Playing video pauses music, stopping video resumes music
- [ ] Keyboard shortcuts work (and don't fire in text inputs)
- [ ] Mobile viewport: card is responsive
- [ ] Error handling: disconnect network, verify auto-skip and error state
- [ ] Reduced motion: enable in OS settings, verify no animations

- [ ] **Step 2: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: complete media player integration with Video.js"
```
