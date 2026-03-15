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
  X,
  Loader2,
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
  return `${y > vh / 2 ? "b" : "t"}${x > vw / 2 ? "r" : "l"}` as Corner;
}

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const springTransition = prefersReducedMotion
  ? { duration: 0 }
  : { type: "spring" as const, damping: 28, stiffness: 320 };

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
    play, pause, next, prev, seek, setTrack, setVolume,
    toggleMute, toggleShuffle, toggleRepeat,
    setPlayerState, setThemeColor,
    setCurrentTime, setDuration, setIsPlaying, setIsBuffering, onTrackError,
  } = useMediaStore.getState();

  const currentTrack = playlist[currentTrackIndex];
  const [fabCorner, setFabCorner] = useState<Corner>("br");
  const fabPos = cornerPos(fabCorner);

  // ── Engine init (native HTML5 Audio — lightweight, no Video.js overhead) ──
  useEffect(() => {
    if (playerInitRef.current || !audioRef.current) return;
    playerInitRef.current = true;

    const audio = audioRef.current!;

    // Create a simple API wrapper that matches what the store expects
    const player = {
      play: () => audio.play().catch(() => {}),
      pause: () => audio.pause(),
      currentTime: (t?: number) => {
        if (t !== undefined) audio.currentTime = t;
        return audio.currentTime;
      },
      volume: (v?: number) => {
        if (v !== undefined) audio.volume = v;
        return audio.volume;
      },
      muted: (m?: boolean) => {
        if (m !== undefined) audio.muted = m;
        return audio.muted;
      },
      duration: () => audio.duration || 0,
      src: (sources: { src: string; type: string }[]) => {
        // Try OGG first, fall back to MP3
        const ogg = sources.find((s) => s.type === "audio/ogg");
        const mp3 = sources.find((s) => s.type === "audio/mpeg");
        if (ogg && audio.canPlayType("audio/ogg")) {
          audio.src = ogg.src;
        } else if (mp3) {
          audio.src = mp3.src;
        }
      },
    };

    setAudioPlayer(player);

    const state = useMediaStore.getState();
    audio.volume = state.volume;
    audio.muted = state.isMuted;

    audio.addEventListener("timeupdate", () => setCurrentTime(audio.currentTime));
    audio.addEventListener("loadedmetadata", () => setDuration(audio.duration || 0));
    audio.addEventListener("ended", () => {
      const s = useMediaStore.getState();
      if (s.repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        useMediaStore.getState().next();
      }
    });
    audio.addEventListener("waiting", () => setIsBuffering(true));
    audio.addEventListener("playing", () => setIsBuffering(false));
    audio.addEventListener("error", () => onTrackError());

    const track = state.playlist[state.currentTrackIndex];
    if (track) {
      player.src([
        { src: track.src, type: "audio/ogg" },
        { src: track.srcFallback, type: "audio/mpeg" },
      ]);
    }
  }, []);

  // ── Keyboard shortcuts ───────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      const s = useMediaStore.getState();
      switch (e.key) {
        case " ": e.preventDefault(); s.isPlaying ? s.pause() : s.play(); break;
        case "ArrowLeft": e.preventDefault(); s.seek(Math.max(0, s.currentTime - 5)); break;
        case "ArrowRight": e.preventDefault(); s.seek(Math.min(s.duration, s.currentTime + 5)); break;
        case "ArrowUp": e.preventDefault(); s.setVolume(Math.min(1, s.volume + 0.1)); break;
        case "ArrowDown": e.preventDefault(); s.setVolume(Math.max(0, s.volume - 0.1)); break;
        case "l": case "L":
          if (s.playerState === "card" || s.playerState === "playlist")
            s.setPlayerState(s.playerState === "playlist" ? "card" : "playlist");
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // ── Character color sync ─────────────────────────────────────────
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

  const progress = duration > 0 ? currentTime / duration : 0;
  const circumference = 2 * Math.PI * 24;
  const togglePlay = useCallback(() => {
    const s = useMediaStore.getState();
    s.isPlaying ? s.pause() : s.play();
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // RENDER — iOS / Video.js v10 glass style
  // ═══════════════════════════════════════════════════════════════════

  return (
    <>
      <audio ref={audioRef} className="hidden" preload="none" />

      <AnimatePresence mode="wait">
        {/* ── FAB ─────────────────────────────────────────────── */}
        {playerState === "fab" && (
          <motion.div
            key="fab"
            className="fixed z-50 cursor-pointer select-none"
            style={{ width: 56, height: 56, left: fabPos.x, top: fabPos.y }}
            initial={{ scale: prefersReducedMotion ? 1 : 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: prefersReducedMotion ? 1 : 0.5, opacity: 0 }}
            transition={springTransition}
            drag
            dragMomentum={false}
            onDragEnd={() => {
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
              <circle cx={28} cy={28} r={24} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
              <circle
                cx={28} cy={28} r={24} fill="none" stroke={themeColor} strokeWidth={3}
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - progress)}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
                style={{ transition: prefersReducedMotion ? "none" : "stroke-dashoffset 0.3s" }}
              />
            </svg>
            <div className="absolute inset-[3px] flex items-center justify-center rounded-full backdrop-blur-2xl bg-black/60 border border-white/[0.06]">
              <Music size={20} style={{ color: themeColor, filter: isPlaying ? `drop-shadow(0 0 8px ${themeColor})` : "none" }} />
            </div>
          </motion.div>
        )}

        {/* ── Card (iOS glass style) — playlist extends from bottom ── */}
        {(playerState === "card" || playerState === "playlist") && (
          <motion.div
            key="card"
            className="fixed bottom-4 right-4 max-sm:right-auto max-sm:left-4 z-50 w-[320px] max-sm:w-[calc(100vw-2rem)]"
            style={{ "--media-accent": themeColor } as React.CSSProperties}
            initial={{ scale: prefersReducedMotion ? 1 : 0.92, opacity: 0, y: prefersReducedMotion ? 0 : 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: prefersReducedMotion ? 1 : 0.92, opacity: 0, y: prefersReducedMotion ? 0 : 24 }}
            transition={springTransition}
          >
            {/* Outer glass container */}
            <div className="relative overflow-hidden rounded-[20px] border border-white/[0.12] shadow-[0_8px_40px_rgba(0,0,0,0.5),0_0_0_0.5px_rgba(255,255,255,0.05)_inset]"
              style={{ backdropFilter: "blur(40px) saturate(1.8)", WebkitBackdropFilter: "blur(40px) saturate(1.8)", background: "rgba(28,28,32,0.72)" }}>

              {/* Ambient glow from accent color */}
              <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full opacity-[0.07] blur-3xl pointer-events-none" style={{ background: themeColor }} />
              <div className="absolute -bottom-16 -left-16 h-32 w-32 rounded-full opacity-[0.05] blur-3xl pointer-events-none" style={{ background: themeColor }} />

              {/* Error banner */}
              <AnimatePresence>
                {errorMessage && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-red-500/20 backdrop-blur-sm text-red-300 text-xs px-4 py-2 text-center border-b border-red-500/10"
                  >
                    {errorMessage}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error overlay */}
              {errorCount >= playlist.length && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[20px]"
                  style={{ backdropFilter: "blur(20px)", background: "rgba(28,28,32,0.95)" }}>
                  <p className="text-sm text-white/60">無法載入音樂</p>
                  <button
                    className="px-5 py-2 rounded-full text-xs font-semibold transition-transform active:scale-95"
                    style={{ backgroundColor: themeColor, color: "#000" }}
                    onClick={() => useMediaStore.getState().setTrack(0)}
                  >
                    重試
                  </button>
                </div>
              )}

              {/* Content */}
              <div className="relative z-[1] p-4 flex flex-col gap-3">

                {/* Header row: close + track info */}
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1 pr-4">
                    <p className="text-[15px] font-semibold text-white/95 truncate leading-tight">
                      {currentTrack?.title ?? "---"}
                    </p>
                    <p className="text-[11px] text-white/35 mt-0.5">LFO BGM Soundtrack</p>
                  </div>
                  <button
                    onClick={() => setPlayerState("fab")}
                    aria-label="最小化"
                    className="p-1.5 -m-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/40 hover:text-white/70 transition-all"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Album art */}
                <div className="relative aspect-square w-full rounded-xl overflow-hidden border border-white/[0.06]">
                  <img
                    src="/images/lfo-album.jpg"
                    alt="LFO Online"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  {/* Waveform overlay at bottom */}
                  <div className="absolute bottom-0 inset-x-0 h-8 flex items-end justify-center gap-[2px] px-4 pb-1.5"
                    style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }}>
                    {Array.from({ length: 24 }).map((_, i) => {
                      const h = isPlaying
                        ? Math.sin((i * 0.4) + (currentTime * 3) + i) * 6 + 8
                        : 2 + Math.sin(i * 0.5) * 1.5;
                      return (
                        <div
                          key={i}
                          className="w-[2px] rounded-full transition-all"
                          style={{
                            height: `${h}px`,
                            backgroundColor: "#fff",
                            opacity: 0.3 + Math.sin(i * 0.3) * 0.15,
                            transitionDuration: prefersReducedMotion ? "0ms" : "150ms",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Progress bar — iOS style thin line */}
                <div className="flex flex-col gap-1.5">
                  <div className="group relative h-[5px] rounded-full bg-white/[0.08] cursor-pointer"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                      seek(pct * duration);
                    }}>
                    {/* Buffer bar */}
                    <div className="absolute inset-y-0 left-0 rounded-full bg-white/[0.06]" style={{ width: `${Math.min(progress * 100 + 10, 100)}%` }} />
                    {/* Progress fill */}
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: themeColor }}>
                      {/* Thumb */}
                      <div className="absolute -right-[6px] top-1/2 -translate-y-1/2 w-[13px] h-[13px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        style={{ backgroundColor: themeColor, boxShadow: `0 0 8px ${themeColor}60` }} />
                    </div>
                    {isBuffering && (
                      <div className="absolute inset-0 rounded-full overflow-hidden">
                        <div className="h-full w-full animate-pulse" style={{ backgroundColor: `${themeColor}20` }} />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-[10px] font-medium tabular-nums">
                    <span className="text-white/30">{fmt(currentTime)}</span>
                    <span className="text-white/30">-{fmt(Math.max(0, duration - currentTime))}</span>
                  </div>
                </div>

                {/* Main controls */}
                <div className="flex items-center justify-center gap-5">
                  <button onClick={prev} aria-label="上一曲"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/50 hover:text-white/90 active:scale-90 transition-all">
                    <SkipBack size={18} fill="currentColor" />
                  </button>
                  <button
                    onClick={togglePlay}
                    aria-label={isPlaying ? "暫停" : "播放"}
                    className="w-11 h-11 rounded-full flex items-center justify-center active:scale-90 transition-all shadow-lg"
                    style={{
                      backgroundColor: themeColor,
                      boxShadow: `0 4px 16px ${themeColor}40`,
                    }}
                  >
                    {isBuffering ? (
                      <Loader2 size={20} className="animate-spin text-black" />
                    ) : isPlaying ? (
                      <Pause size={20} className="text-black" fill="black" />
                    ) : (
                      <Play size={20} className="text-black ml-0.5" fill="black" />
                    )}
                  </button>
                  <button onClick={next} aria-label="下一曲"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center text-white/50 hover:text-white/90 active:scale-90 transition-all">
                    <SkipForward size={18} fill="currentColor" />
                  </button>
                </div>

                {/* Bottom bar: shuffle, repeat, volume, playlist */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={toggleShuffle} aria-label="隨機播放"
                      className="p-1.5 rounded-full transition-all active:scale-90"
                      style={{ color: shuffleOn ? themeColor : "rgba(255,255,255,0.3)" }}>
                      <Shuffle size={15} />
                    </button>
                    <button onClick={toggleRepeat} aria-label="循環播放"
                      className="p-1.5 rounded-full transition-all active:scale-90"
                      style={{ color: repeat !== "none" ? themeColor : "rgba(255,255,255,0.3)" }}>
                      {repeat === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Volume — desktop */}
                    <div className="hidden sm:flex items-center gap-1.5">
                      <button onClick={toggleMute} aria-label="音量" className="text-white/30 hover:text-white/60 transition-colors p-1">
                        {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </button>
                      <div className="relative w-[60px] h-[3px] rounded-full bg-white/[0.08] cursor-pointer group"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                          setVolume(pct);
                        }}>
                        <div className="absolute inset-y-0 left-0 rounded-full bg-white/40" style={{ width: `${(isMuted ? 0 : volume) * 100}%` }} />
                      </div>
                    </div>
                    {/* Volume — mobile mute only */}
                    <button onClick={toggleMute} aria-label="音量"
                      className="sm:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-white/30 hover:text-white/60 transition-colors">
                      {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    {/* Playlist toggle */}
                    <button onClick={() => setPlayerState(playerState === "playlist" ? "card" : "playlist")} aria-label="播放清單"
                      className="p-1.5 rounded-full transition-all active:scale-90"
                      style={{
                        backgroundColor: playerState === "playlist" ? `${themeColor}20` : "rgba(255,255,255,0.06)",
                        color: playerState === "playlist" ? themeColor : "rgba(255,255,255,0.4)",
                      }}>
                      <ListMusic size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Playlist (slides out from card) ─────────────── */}
              <AnimatePresence>
                {playerState === "playlist" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={prefersReducedMotion ? { duration: 0 } : { type: "spring", damping: 28, stiffness: 300 }}
                    className="overflow-hidden border-t border-white/[0.06]"
                  >
                    <div className="relative">
                      <div className="max-h-[280px] max-sm:max-h-[50vh] overflow-y-auto">
                        <div className="py-1">
                          {playlist.map((track, i) => {
                            const active = i === currentTrackIndex;
                            return (
                              <button
                                key={track.id}
                                onClick={() => setTrack(i)}
                                className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                                style={active ? { backgroundColor: `${themeColor}12` } : undefined}
                              >
                                <span className="w-6 text-right text-[11px] font-medium shrink-0 tabular-nums"
                                  style={{ color: active ? themeColor : "rgba(255,255,255,0.25)" }}>
                                  {active && isPlaying ? (
                                    <span className="inline-flex items-end gap-[1.5px] h-3 justify-center">
                                      {[0, 1, 2].map((j) => (
                                        <span key={j} className="inline-block w-[2px] rounded-full animate-pulse"
                                          style={{ backgroundColor: themeColor, height: `${6 + j * 3}px`, animationDelay: `${j * 0.15}s` }} />
                                      ))}
                                    </span>
                                  ) : (
                                    i + 1
                                  )}
                                </span>
                                <span className="flex-1 text-[12px] font-medium truncate"
                                  style={{ color: active ? themeColor : "rgba(255,255,255,0.65)" }}>
                                  {track.title}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {/* Bottom fade */}
                      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-[rgba(28,28,32,0.7)] to-transparent" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
