# Media Player Integration — Video.js v10

**Date:** 2026-03-15
**Status:** Approved

## Overview

Integrate Video.js v10 (beta) to provide a floating music player and inline video player for the LFO Wiki. The music player persists across page navigation with a playlist of 92 BGM tracks from archive.org. The video player embeds in MDX content pages. Both adapt their accent color to the current character's theme color.

**Note:** Video.js v10 is currently in beta (ground-up rewrite, first-class React/TS support, modern skins). If v10 beta proves unstable, fall back to Video.js v8 with custom CSS skin to achieve the same rounded/glassmorphism aesthetic.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Root Layout                                         │
│  ┌───────────────────────────────────────────────┐  │
│  │  Page Content (MDX / routes)                   │  │
│  │  ┌─────────────────────────────────────────┐  │  │
│  │  │ <VideoPlayer src="..." title="..." />    │  │  │
│  │  │ Inline, Video.js native skin             │  │  │
│  │  └─────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  <MusicPlayer />  — floating card, bottom-right│  │
│  │  Video.js engine (hidden) + custom React UI    │  │
│  │  Zustand store for state persistence           │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Components

### 1. MusicPlayer (`components/music-player.tsx`)

Floating card positioned fixed bottom-right. Three visual states:

**FAB (minimized):** 56px rounded icon with progress ring border. Snaps to nearest corner on drag release (not freeform). Position is not persisted — defaults to bottom-right on reload. Uses `motion` drag with `dragConstraints` set to viewport bounds and `dragElastic={0.1}`.

**Card (playing):** ~420px wide floating card inspired by iOS music player style:
- Left: album art area with LFO branding + animated waveform bars at bottom
- Right: track title, artist/album label, progress scrubber with timestamps, play/pause + prev/next controls, shuffle/repeat toggles, volume slider, playlist toggle button
- Glassmorphism: `backdrop-blur-xl`, semi-transparent dark background, subtle border, ambient shadow
- Amber accent by default, adapts to character color on character pages

**Card + Playlist (expanded):** Card header compresses to a compact row (small art, title, mini progress, controls). Below it, a scrollable playlist slides down with motion spring animation:
- Active track highlighted with accent color background + animated equalizer bars
- Track list: number, title, duration
- Bottom fade gradient on scroll overflow
- Max height ~280px

**Transitions between states:** motion spring scale + fade. FAB → Card expands from corner. Card → Playlist slides down.

**Engine lifecycle:**
- A singleton Video.js audio instance is created once when `MusicPlayer` mounts, stored in a module-scoped `ref` (not React state).
- The instance is never destroyed — `MusicPlayer` is rendered at root layout and never unmounts.
- Store actions (`play`, `pause`, `seek`, etc.) call the Video.js API directly via the ref.
- Video.js `timeupdate`, `ended`, `loadedmetadata` events sync `currentTime` and `duration` back to the store via listeners registered on mount.
- OGG → MP3 fallback is handled natively by Video.js `sources` array: `[{ src: ogg, type: 'audio/ogg' }, { src: mp3, type: 'audio/mpeg' }]`.

**Persistence:** Zustand store (`useMediaStore`) with `persist` middleware saves: `currentTrackIndex`, `volume`, `isMuted`, `shuffle`, `repeat`, `playerState`. Playback position resets on page reload (no resume mid-track).

**Keyboard shortcuts:** Only active when the music player card is focused or when no other focusable element (input, textarea, contenteditable) has focus. Registered via a `useEffect` with `keydown` listener that checks `document.activeElement`. Shortcuts: Space = play/pause, ← → = seek 5s, ↑ ↓ = volume, L = toggle playlist.

**Mobile:** Collapses to FAB by default. Tap to expand card. Playlist is full-width on small screens.

**Loading & error states:**
- While audio is buffering: pulsing animation on progress bar, play button shows spinner
- On load failure (network error, 404): toast notification "無法載入音樂", auto-skip to next track after 2s
- If all tracks fail: show error state in card with retry button

### 2. VideoPlayer (`components/video-player.tsx`)

Inline MDX component for embedding video in wiki pages. Must be registered in `components/mdx.tsx` → `getMDXComponents()` to be available in MDX content.

**Usage in MDX:**
```mdx
<VideoPlayer src="https://example.com/video.mp4" title="v12.0 開場動畫" />
<VideoPlayer src="https://youtube.com/watch?v=..." title="遊戲預告" />
<VideoPlayer src="https://bilibili.com/video/BV..." title="遊戲實況" />
```

**Design:** Video.js v10 default skin — no custom controls. The v10 skin provides glassmorphism frosted control bar, rounded corners, modern aesthetic. Only CSS overrides:
- Accent color → character accent (progress bar, scrubber thumb) via CSS custom property
- Container `border-radius: 2rem` + outer shadow + border to match wiki card style
- Font family: Noto Sans TC
- Optional caption/title below the player

**Source handling:**
- Direct URLs (mp4, webm, ogg): native Video.js playback
- YouTube: detect YouTube URL pattern in `src` prop → render a responsive `<iframe>` embed with `lite-youtube-embed` for performance (no `videojs-youtube` plugin — it is unmaintained). The iframe is styled to match the rounded card aesthetic.
- Bilibili: detect `bilibili.com/video/BV...` pattern → extract BV ID → render `<iframe src="https://player.bilibili.com/player.html?bvid=BV...">` with matching rounded styling. Note: Bilibili embeds may be geo-restricted; show a fallback link "在Bilibili上觀看" if the iframe fails to load.

**Lazy loading:** Video.js is not loaded on page load. The component renders a static poster/thumbnail with a play button overlay. Video.js initializes only on first play click via dynamic `import()`.

**Audio coexistence:** When video starts playing, check if music `isPlaying` — if so, set `musicWasPlayingBeforeVideo = true` and pause music. When video pauses/ends, only resume music if `musicWasPlayingBeforeVideo` was true. Multiple `VideoPlayer` instances: track a `videoPlayingCount` number. Music only resumes when count drops to 0. Navigation away: video elements are destroyed by React unmount, which triggers pause → coexistence handler fires normally.

**Loading & error states:**
- Poster/thumbnail shown before first play
- Buffering: Video.js default spinner
- Load failure: show error overlay with "無法載入影片" + retry button + source link

### 3. Media Store (`lib/media-store.ts`)

Zustand store managing all media playback state:

```typescript
interface Track {
  id: string
  title: string
  src: string          // OGG URL
  srcFallback: string  // MP3 URL
}

interface MediaStore {
  // Music state — playlist is static, loaded from tracks.json on init
  playlist: Track[]           // always the full 92-track list, not user-modifiable
  currentTrackIndex: number
  isPlaying: boolean
  isBuffering: boolean
  volume: number
  isMuted: boolean
  shuffle: boolean
  repeat: 'none' | 'one' | 'all'
  currentTime: number
  duration: number
  playerState: 'fab' | 'card' | 'playlist'

  // Theme — reads from existing --color-fd-primary CSS variable
  themeColor: string  // character accent, default '#ffbf00'

  // Video coexistence
  videoPlayingCount: number
  musicWasPlayingBeforeVideo: boolean

  // Actions
  play: () => void
  pause: () => void
  next: () => void
  prev: () => void
  seek: (time: number) => void
  setVolume: (vol: number) => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  setPlayerState: (state: 'fab' | 'card' | 'playlist') => void
  setThemeColor: (color: string) => void
  onVideoPlay: () => void   // increments videoPlayingCount
  onVideoPause: () => void  // decrements videoPlayingCount
}
```

Persisted fields (via Zustand persist): `volume`, `isMuted`, `shuffle`, `repeat`, `currentTrackIndex`, `playerState`.

Non-persisted: `playlist` (loaded from `tracks.json` import on init), `isPlaying`, `isBuffering`, `currentTime`, `duration`, `videoPlayingCount`, `musicWasPlayingBeforeVideo`, `themeColor`.

### 4. Track Data (`data/tracks.json`)

92 BGM tracks extracted from `https://archive.org/details/lfo_song`:

```json
[
  {
    "id": "MainTheme_P6",
    "title": "MainTheme P6",
    "src": "https://archive.org/download/lfo_song/MainTheme_P6.ogg",
    "srcFallback": "https://archive.org/download/lfo_song/MainTheme_P6.mp3"
  }
]
```

Extraction script (`scripts/extract-tracks.py`) scrapes the archive.org listing page to build this JSON. The script must be run once during development; `tracks.json` is committed to the repo.

### 5. Video.js CSS Overrides (`styles/videojs-wiki.css`)

Minimal overrides on top of Video.js default skin:

```css
.video-js.vjs-wiki {
  border-radius: 2rem;
  overflow: hidden;
  border: 1px solid oklch(0.28 0.008 265 / 0.4);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  font-family: 'Noto Sans TC', system-ui, sans-serif;
}

/* Accent color override — set --media-accent on the container */
.video-js.vjs-wiki .vjs-play-progress,
.video-js.vjs-wiki .vjs-volume-level {
  background: var(--media-accent, #ffbf00);
}

.video-js.vjs-wiki .vjs-play-progress .vjs-time-tooltip {
  background: var(--media-accent, #ffbf00);
}
```

If using v8 fallback, additional CSS needed for rounded control bar and backdrop-blur.

## Dependencies

- `video.js` v10 (beta) — core player engine. Fallback: v8 + custom CSS.
- `lite-youtube-embed` — lightweight YouTube embed (no heavy iframe until play)
- No `videojs-youtube` plugin (unmaintained, compatibility issues)
- No additional audio libraries — Video.js handles audio playback too

## Character Color Integration

Reuse the existing `--color-fd-primary` CSS custom property already set by `useCharacterTheme` in `routes/docs/$.tsx`. The music player and video player read this variable to set their accent color. The `themeColor` in the Zustand store is updated by reading the computed CSS variable value in a `useEffect` that watches route changes — this avoids a parallel color system.

```typescript
// In MusicPlayer or a shared hook
useEffect(() => {
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-fd-primary').trim()
  if (color) setThemeColor(color)
}, [pathname])
```

On non-character pages where `--color-fd-primary` is not set, falls back to default amber `#ffbf00`.

## Accessibility

- All controls keyboard-accessible (Video.js provides this by default)
- Custom music player controls have proper `aria-label` attributes
- `prefers-reduced-motion`: disable motion spring animations, use instant transitions
- Keyboard shortcuts scoped — never fire when focus is in text input or editable area
- Video.js provides built-in ARIA attributes for video controls

## File Structure

```
components/
  music-player.tsx      — floating card music player (FAB/card/playlist states)
  video-player.tsx      — inline MDX video component with Video.js
lib/
  media-store.ts        — Zustand store for all media playback state
data/
  tracks.json           — 92 BGM tracks from archive.org
styles/
  videojs-wiki.css      — minimal Video.js accent/styling overrides
scripts/
  extract-tracks.py     — scrape archive.org track listing into tracks.json
```
