"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLocation } from "@tanstack/react-router";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  Music,
  Minimize2,
  Loader2,
  ChevronUp,
} from "lucide-react";
import { useMediaStore, setAudioPlayer, getAudioPlayer } from "@/lib/media-store";

// ── helpers ──────────────────────────────────────────────────────────
function fmt(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── FAB corner snap ──────────────────────────────────────────────────
type Corner = "bl" | "br" | "tl" | "tr";
const MARGIN = 16;
function cornerPos(c: Corner) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const size = 56;
  return {
    x: c.includes("r") ? vw - size - MARGIN : MARGIN,
    y: c.includes("b") ? vh - size - MARGIN : MARGIN,
  };
}
function nearestCorner(x: number, y: number): Corner {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const right = x > vw / 2;
  const bottom = y > vh / 2;
  return `${bottom ? "b" : "t"}${right ? "r" : "l"}` as Corner;
}

// ── WaveformBars ─────────────────────────────────────────────────────
function WaveformBars({ playing, color }: { playing: boolean; color: string }) {
  return (
    <div className="flex items-end gap-[3px] h-6">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full"
          style={{ backgroundColor: color }}
          animate={
            playing
              ? { height: ["6px", "20px", "10px", "24px", "6px"] }
              : { height: "6px" }
          }
          transition={
            playing
              ? {
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerInitRef = useRef(false);

  // store slices
  const playlist = useMediaStore((s) => s.playlist);
  const currentTrackIndex = useMediaStore((s) => s.currentTrackIndex);
  const isPlaying = useMediaStore((s) => s.isPlaying);
  const isBuffering = useMediaStore((s) => s.isBuffering);
  const volume = useMediaStore((s) => s.volume);
  const isMuted = useMediaStore((s) => s.isMuted);
  const shuffleOn = useMediaStore((s) => s.shuffle);
  const repeat = useMediaStore((s) => s.repeat);
  const currentTime = useMediaStore((s) => s.currentTime);
  const duration = useMediaStore((s) => s.duration);
  const playerState = useMediaStore((s) => s.playerState);
  const themeColor = useMediaStore((s) => s.themeColor);
  const errorCount = useMediaStore((s) => s.errorCount);
  const errorMessage = useMediaStore((s) => s.errorMessage);

  const {
    play,
    pause,
    next,
    prev,
    seek,
    setTrack,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    setPlayerState,
    setThemeColor,
    setCurrentTime,
    setDuration,
    setIsPlaying,
    setIsBuffering,
    onTrackError,
  } = useMediaStore.getState();

  const currentTrack = playlist[currentTrackIndex];

  // ── FAB drag state ───────────────────────────────────────────────
  const [fabCorner, setFabCorner] = useState<Corner>("br");
  const fabPos = cornerPos(fabCorner);

  // ── Engine init ──────────────────────────────────────────────────
  useEffect(() => {
    if (playerInitRef.current || !audioRef.current) return;
    playerInitRef.current = true;

    (async () => {
      const videojs = (await import("video.js")).default;
      const player = videojs(audioRef.current!, {
        controls: false,
        autoplay: false,
        preload: "auto",
      });

      setAudioPlayer(player);

      // Restore persisted volume/mute
      const state = useMediaStore.getState();
      player.volume(state.volume);
      player.muted(state.isMuted);

      // Events
      player.on("timeupdate", () => {
        setCurrentTime(player.currentTime() ?? 0);
      });
      player.on("loadedmetadata", () => {
        setDuration(player.duration() ?? 0);
      });
      player.on("ended", () => {
        const s = useMediaStore.getState();
        if (s.repeat === "one") {
          player.currentTime(0);
          player.play();
        } else {
          useMediaStore.getState().next();
        }
      });
      player.on("waiting", () => setIsBuffering(true));
      player.on("playing", () => setIsBuffering(false));
      player.on("error", () => onTrackError());

      // Load first track without autoplay
      const track = state.playlist[state.currentTrackIndex];
      if (track) {
        player.src([
          { src: track.src, type: "audio/ogg" },
          { src: track.srcFallback, type: "audio/mpeg" },
        ]);
      }
    })();

    return () => {
      const p = getAudioPlayer();
      if (p && !p.isDisposed()) {
        p.dispose();
      }
    };
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      )
        return;

      const s = useMediaStore.getState();
      switch (e.key) {
        case " ":
          e.preventDefault();
          s.isPlaying ? s.pause() : s.play();
          break;
        case "ArrowLeft":
          e.preventDefault();
          s.seek(Math.max(0, s.currentTime - 5));
          break;
        case "ArrowRight":
          e.preventDefault();
          s.seek(Math.min(s.duration, s.currentTime + 5));
          break;
        case "ArrowUp":
          e.preventDefault();
          s.setVolume(Math.min(1, s.volume + 0.1));
          break;
        case "ArrowDown":
          e.preventDefault();
          s.setVolume(Math.max(0, s.volume - 0.1));
          break;
        case "l":
        case "L":
          s.setPlayerState(s.playerState === "playlist" ? "card" : "playlist");
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ── Character color sync (Task 9) ───────────────────────────────
  const location = useLocation();
  useEffect(() => {
    const el = document.documentElement;
    function readColor() {
      const val = getComputedStyle(el).getPropertyValue("--color-fd-primary").trim();
      setThemeColor(val || "#ffbf00");
    }
    readColor();
    const observer = new MutationObserver(() => readColor());
    observer.observe(el, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, [location.pathname]);

  // ── Progress for FAB ring ────────────────────────────────────────
  const progress = duration > 0 ? currentTime / duration : 0;
  const circumference = 2 * Math.PI * 24; // r=24

  // ── Toggle play/pause ────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const s = useMediaStore.getState();
    s.isPlaying ? s.pause() : s.play();
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════

  const glass = "backdrop-blur-xl bg-[rgba(20,16,32,0.92)] border border-white/[0.08]";

  return (
    <>
      {/* Hidden audio element for Video.js */}
      <div className="hidden">
        <audio ref={audioRef} className="video-js" />
      </div>

      <AnimatePresence mode="wait">
        {/* ── FAB ─────────────────────────────────────────────── */}
        {playerState === "fab" && (
          <motion.div
            key="fab"
            className="fixed z-50 cursor-pointer select-none"
            style={{ width: 56, height: 56, left: fabPos.x, top: fabPos.y }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            drag
            dragMomentum={false}
            onDragEnd={(_, info) => {
              const el = document.querySelector("[data-music-fab]") as HTMLElement;
              if (el) {
                const rect = el.getBoundingClientRect();
                setFabCorner(nearestCorner(rect.left + 28, rect.top + 28));
              }
            }}
            onClick={() => setPlayerState("card")}
            aria-label="展開音樂播放器"
            role="button"
            data-music-fab
          >
            <svg width={56} height={56} viewBox="0 0 56 56">
              <circle
                cx={28}
                cy={28}
                r={24}
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={3}
              />
              <circle
                cx={28}
                cy={28}
                r={24}
                fill="none"
                stroke={themeColor}
                strokeWidth={3}
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                style={{ transition: "stroke-dashoffset 0.3s" }}
              />
            </svg>
            <div
              className="absolute inset-0 flex items-center justify-center rounded-full"
              style={{
                background: `radial-gradient(circle, rgba(20,16,32,0.95) 60%, rgba(20,16,32,0.7))`,
              }}
            >
              <Music
                size={22}
                style={{
                  color: themeColor,
                  filter: isPlaying ? `drop-shadow(0 0 6px ${themeColor})` : "none",
                }}
              />
            </div>
          </motion.div>
        )}

        {/* ── Card ────────────────────────────────────────────── */}
        {playerState === "card" && (
          <motion.div
            key="card"
            className={`fixed bottom-4 right-4 z-50 w-[420px] max-w-[calc(100vw-32px)] rounded-2xl shadow-2xl overflow-hidden ${glass}`}
            style={{ "--media-accent": themeColor } as React.CSSProperties}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Error banner */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-red-500/90 text-white text-xs px-3 py-1.5 text-center overflow-hidden"
                >
                  {errorMessage}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Full error overlay */}
            {errorCount >= playlist.length && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[rgba(20,16,32,0.97)] rounded-2xl">
                <p className="text-sm text-white/70">無法載入音樂</p>
                <button
                  className="px-4 py-1.5 rounded-lg text-xs font-medium"
                  style={{ backgroundColor: themeColor, color: "#000" }}
                  onClick={() => {
                    const s = useMediaStore.getState();
                    s.setTrack(0);
                  }}
                >
                  重試
                </button>
              </div>
            )}

            <div className="flex">
              {/* Left: branded area */}
              <div
                className="relative w-[180px] min-h-[180px] flex flex-col items-center justify-center overflow-hidden shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${themeColor}22 0%, rgba(20,16,32,1) 100%)`,
                }}
              >
                <span
                  className="text-4xl font-bold tracking-wider opacity-30 select-none"
                  style={{ color: themeColor }}
                >
                  LFO
                </span>
                <div className="absolute bottom-3">
                  <WaveformBars playing={isPlaying} color={themeColor} />
                </div>
              </div>

              {/* Right: controls */}
              <div className="flex-1 flex flex-col p-4 gap-2.5 min-w-0">
                {/* Minimize button */}
                <button
                  className="absolute top-2 right-2 p-1 rounded-lg text-white/40 hover:text-white/80 transition-colors"
                  onClick={() => setPlayerState("fab")}
                  aria-label="最小化"
                >
                  <Minimize2 size={14} />
                </button>

                {/* Track info */}
                <div className="pr-6">
                  <p className="text-sm font-bold text-white truncate">
                    {currentTrack?.title ?? "---"}
                  </p>
                  <p className="text-[11px] text-white/40">LFO BGM</p>
                </div>

                {/* Progress scrubber */}
                <div className="flex flex-col gap-1">
                  <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => seek(parseFloat(e.target.value))}
                    className="music-progress w-full h-1 appearance-none rounded-full cursor-pointer"
                    style={
                      {
                        "--pct": `${(duration > 0 ? currentTime / duration : 0) * 100}%`,
                        "--accent": themeColor,
                        background: `linear-gradient(to right, ${themeColor} var(--pct), rgba(255,255,255,0.1) var(--pct))`,
                      } as React.CSSProperties
                    }
                  />
                  <div className="flex justify-between text-[10px] text-white/30">
                    <span>{fmt(currentTime)}</span>
                    <span>{fmt(duration)}</span>
                  </div>
                </div>

                {/* Main controls */}
                <div className="flex items-center justify-center gap-5">
                  <button onClick={prev} aria-label="上一曲" className="text-white/60 hover:text-white transition-colors">
                    <SkipBack size={18} />
                  </button>
                  <button
                    onClick={togglePlay}
                    aria-label={isPlaying ? "暫停" : "播放"}
                    className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform"
                  >
                    {isBuffering ? (
                      <Loader2 size={20} className="animate-spin text-black" />
                    ) : isPlaying ? (
                      <Pause size={20} className="text-black" />
                    ) : (
                      <Play size={20} className="text-black ml-0.5" />
                    )}
                  </button>
                  <button onClick={next} aria-label="下一曲" className="text-white/60 hover:text-white transition-colors">
                    <SkipForward size={18} />
                  </button>
                </div>

                {/* Bottom row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleShuffle}
                      aria-label="隨機播放"
                      className="transition-colors"
                      style={{ color: shuffleOn ? themeColor : "rgba(255,255,255,0.4)" }}
                    >
                      <Shuffle size={14} />
                    </button>
                    <button
                      onClick={toggleRepeat}
                      aria-label="循環播放"
                      className="transition-colors"
                      style={{ color: repeat !== "none" ? themeColor : "rgba(255,255,255,0.4)" }}
                    >
                      {repeat === "one" ? <Repeat1 size={14} /> : <Repeat size={14} />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleMute}
                      aria-label="音量"
                      className="text-white/40 hover:text-white/80 transition-colors"
                    >
                      {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="music-volume w-16 h-1 appearance-none rounded-full cursor-pointer"
                      style={
                        {
                          "--pct": `${(isMuted ? 0 : volume) * 100}%`,
                          "--accent": themeColor,
                          background: `linear-gradient(to right, ${themeColor} var(--pct), rgba(255,255,255,0.1) var(--pct))`,
                        } as React.CSSProperties
                      }
                    />
                    <button
                      onClick={() => setPlayerState("playlist")}
                      aria-label="播放清單"
                      className="text-white/40 hover:text-white/80 transition-colors"
                    >
                      <ListMusic size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Playlist ────────────────────────────────────────── */}
        {playerState === "playlist" && (
          <motion.div
            key="playlist"
            className={`fixed bottom-4 right-4 z-50 w-[420px] max-w-[calc(100vw-32px)] rounded-2xl shadow-2xl overflow-hidden ${glass}`}
            style={{ "--media-accent": themeColor } as React.CSSProperties}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Compact header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
              {/* Mini album art */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${themeColor}22 0%, rgba(20,16,32,1) 100%)`,
                }}
              >
                <Music size={16} style={{ color: themeColor }} />
              </div>

              {/* Title + mini progress */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {currentTrack?.title ?? "---"}
                </p>
                <div className="w-full h-0.5 mt-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progress * 100}%`,
                      backgroundColor: themeColor,
                    }}
                  />
                </div>
              </div>

              {/* Mini controls */}
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={prev} aria-label="上一曲" className="text-white/50 hover:text-white transition-colors">
                  <SkipBack size={14} />
                </button>
                <button
                  onClick={togglePlay}
                  aria-label={isPlaying ? "暫停" : "播放"}
                  className="w-7 h-7 rounded-full bg-white flex items-center justify-center"
                >
                  {isBuffering ? (
                    <Loader2 size={14} className="animate-spin text-black" />
                  ) : isPlaying ? (
                    <Pause size={14} className="text-black" />
                  ) : (
                    <Play size={14} className="text-black ml-px" />
                  )}
                </button>
                <button onClick={next} aria-label="下一曲" className="text-white/50 hover:text-white transition-colors">
                  <SkipForward size={14} />
                </button>
              </div>

              {/* Back to card */}
              <button
                onClick={() => setPlayerState("card")}
                aria-label="播放清單"
                className="text-white/40 hover:text-white/80 transition-colors ml-1"
              >
                <ListMusic size={14} />
              </button>
            </div>

            {/* Track list */}
            <div className="relative">
              <div className="max-h-[280px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                {playlist.map((track, i) => (
                  <button
                    key={track.id}
                    onClick={() => setTrack(i)}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/[0.04] transition-colors"
                    style={
                      i === currentTrackIndex
                        ? { backgroundColor: `${themeColor}1a` }
                        : undefined
                    }
                  >
                    <span
                      className="w-6 text-right text-[11px] shrink-0"
                      style={{
                        color: i === currentTrackIndex ? themeColor : "rgba(255,255,255,0.3)",
                      }}
                    >
                      {i === currentTrackIndex && isPlaying ? (
                        <span className="inline-flex items-center gap-px">
                          <span className="inline-block w-[2px] h-2 rounded-full animate-pulse" style={{ backgroundColor: themeColor }} />
                          <span className="inline-block w-[2px] h-3 rounded-full animate-pulse" style={{ backgroundColor: themeColor, animationDelay: "0.15s" }} />
                          <span className="inline-block w-[2px] h-2 rounded-full animate-pulse" style={{ backgroundColor: themeColor, animationDelay: "0.3s" }} />
                        </span>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className="flex-1 text-xs truncate"
                      style={{
                        color: i === currentTrackIndex ? themeColor : "rgba(255,255,255,0.7)",
                      }}
                    >
                      {track.title}
                    </span>
                  </button>
                ))}
              </div>
              {/* Bottom fade */}
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[rgba(20,16,32,0.95)] to-transparent" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Range input styling */}
      <style>{`
        .music-progress::-webkit-slider-thumb,
        .music-volume::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--accent, #ffbf00);
          cursor: pointer;
          border: none;
        }
        .music-progress::-moz-range-thumb,
        .music-volume::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--accent, #ffbf00);
          cursor: pointer;
          border: none;
        }
      `}</style>
    </>
  );
}
