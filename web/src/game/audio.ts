import { ASSETS } from "@/lib/assets";

// Sound effects through WebAudio (decoded once, overlapping playback), BGM through a single
// <audio> element with a short crossfade. Browsers only allow sound after a user gesture;
// `unlock()` is called from the first key press or click.

const BASE = `${ASSETS}/game`;

class GameAudio {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private bgm: HTMLAudioElement | null = null;
  private sfxGain: GainNode | null = null;
  muted = false;

  /** True once a user gesture has started the audio context (title screen or StartGate). */
  get unlocked() {
    return this.ctx !== null;
  }

  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.55;
      this.sfxGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.bgm?.paused && !this.muted) void this.bgm.play().catch(() => {});
  }

  private load(name: string) {
    let p = this.buffers.get(name);
    if (!p && this.ctx) {
      const ctx = this.ctx;
      p = fetch(`${BASE}/sfx/${name}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => ctx.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(name, p);
    }
    return p ?? Promise.resolve(null);
  }

  /** Fire and forget; `pan` in -1..1. */
  sfx(name: string, { volume = 1, pan = 0 } = {}) {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const out = this.sfxGain;
    void this.load(name).then((buf) => {
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = volume;
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      src.connect(g).connect(p).connect(out);
      src.start();
    });
  }

  music(name: string | null, volume = 0.4) {
    const prev = this.bgm;
    if (prev && name && prev.dataset.name === name) return;
    if (prev) fade(prev, 0, 600, () => prev.pause());
    if (!name) {
      this.bgm = null;
      return;
    }
    const a = new Audio(`${BASE}/bgm/${name}`);
    a.dataset.name = name;
    a.loop = true;
    a.volume = 0;
    this.bgm = a;
    if (!this.muted && this.ctx) void a.play().catch(() => {});
    fade(a, volume, 900);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.bgm && this.muted) this.bgm.pause();
    else if (this.bgm) void this.bgm.play().catch(() => {});
    return this.muted;
  }
}

function fade(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  const from = el.volume;
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    el.volume = Math.min(1, Math.max(0, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

export const audio = new GameAudio();
