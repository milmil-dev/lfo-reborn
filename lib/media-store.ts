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
  errorCount: number;
  errorMessage: string | null;
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

let audioPlayer: any = null;

export function setAudioPlayer(player: any) {
  audioPlayer = player;
}

export function getAudioPlayer() {
  return audioPlayer;
}

function loadTrack(track: Track) {
  audioPlayer?.src([
    { src: track.src, type: "audio/ogg" },
    { src: track.srcFallback, type: "audio/mpeg" },
  ]);
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
          loadTrack(track);
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
          loadTrack(track);
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
          loadTrack(track);
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
        const trackName = playlist[currentTrackIndex]?.title ?? "";
        set({ errorMessage: `無法載入音樂: ${trackName}` });
        setTimeout(() => set({ errorMessage: null }), 3000);
        if (newCount >= playlist.length) {
          set({ errorCount: newCount, isPlaying: false, isBuffering: false });
          return;
        }
        set({ errorCount: newCount });
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
