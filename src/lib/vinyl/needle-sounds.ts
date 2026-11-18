// Turntable foley, synthesized with Web Audio: surface crackle while the stylus is in the
// groove, a soft thump when it lands, a click when it lifts, and the run-out groove's tick.
// The music itself (Spotify SDK, YouTube iframe) can't be reached from the page, so this
// is a separate layer that follows the tonearm (VinylStage's needle events).

import type { NeedleEvent } from "./stage";

/** One revolution at 33⅓ rpm: scratches on the record come round this often. */
const REVOLUTION = 1.8;
/** Overall level relative to the player's volume. */
const LEVEL = 0.9;

/** Deterministic noise, so the record sounds the same each time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return s / 4294967296;
  };
}

/** Adds a click at `at` seconds: a sharp attack with a short decay, random polarity. */
function addPop(data: Float32Array, rate: number, at: number, amp: number, decayMs: number, rand: () => number) {
  const start = Math.floor(at * rate);
  const len = Math.floor((decayMs / 1000) * rate * 5);
  const sign = rand() < 0.5 ? -1 : 1;
  for (let i = 0; i < len; i++) {
    const j = (start + i) % data.length;
    const env = Math.exp(-i / ((decayMs / 1000) * rate));
    // Two cycles of a ring, so it reads as a click rather than a step.
    data[j] += sign * amp * env * Math.cos(i * 0.9) * (0.6 + 0.4 * rand());
  }
}

/** Hiss with fine crackle, long enough not to sound looped. */
function surfaceNoise(ctx: BaseAudioContext): AudioBuffer {
  const seconds = 7.3;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rand = rng(33);
  let lp = 0;
  for (let i = 0; i < data.length; i++) {
    lp += (rand() * 2 - 1 - lp) * 0.35; // soften the hiss a little
    data[i] = lp * 0.006;
  }
  for (let t = 0; t < seconds; t += -Math.log(1 - rand()) / 22) addPop(data, ctx.sampleRate, t, 0.008 + rand() * 0.03, 0.25, rand);
  for (let t = 0; t < seconds; t += -Math.log(1 - rand()) / 0.6) addPop(data, ctx.sampleRate, t, 0.05 + rand() * 0.09, 0.6, rand);
  return buf;
}

/** One revolution with a couple of scratches, so they come back every turn like on a worn record. */
function scratchLoop(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * REVOLUTION), ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rand = rng(78);
  addPop(data, ctx.sampleRate, 0.41, 0.09, 0.8, rand);
  addPop(data, ctx.sampleRate, 1.27, 0.045, 0.5, rand);
  return buf;
}

function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rand = rng(5);
  for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
  return buf;
}

export class NeedleSounds {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private groove: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = false;
  private volume = 0.8;
  private inGroove = false;
  private readonly abort = new AbortController();

  /** Turns the sounds on or off. The audio context is created the first time they're on. */
  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.ensure();
    this.applyLevel();
  }

  /** The player's volume (0..1); the sounds sit under the music at the same setting. */
  setVolume(volume: number) {
    this.volume = volume;
    this.applyLevel();
  }

  /** Whether the stylus is in the groove, without the landing or lifting sound (e.g. on start-up). */
  setGroove(down: boolean) {
    if (down === this.inGroove) return;
    this.inGroove = down;
    const ctx = this.ctx;
    if (ctx && this.groove) this.groove.gain.setTargetAtTime(down ? 1 : 0, ctx.currentTime, down ? 0.04 : 0.02);
  }

  needle(event: NeedleEvent) {
    if (event === "down" || event === "up") {
      const down = event === "down";
      if (down === this.inGroove) return;
      this.setGroove(down);
    }
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    if (event === "down") this.thump();
    else if (event === "up") this.click(0.035, 2400, 0.006);
    else this.tick();
  }

  dispose() {
    this.abort.abort();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private ensure() {
    if (this.ctx || typeof AudioContext === "undefined") return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    // Surface noise: hiss and crackle, plus the once-a-turn scratches, band-limited like a cartridge.
    const groove = ctx.createGain();
    groove.gain.value = this.inGroove ? 1 : 0;
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 140;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 7500;
    highpass.connect(lowpass).connect(groove).connect(master);
    for (const buffer of [surfaceNoise(ctx), scratchLoop(ctx)]) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(highpass);
      src.start();
    }
    this.groove = groove;
    this.noise = whiteNoise(ctx, 0.5);

    // Browsers start audio contexts suspended until a gesture: resume on the next one.
    const resume = () => {
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    };
    resume();
    const opts = { capture: true, signal: this.abort.signal };
    window.addEventListener("pointerdown", resume, opts);
    window.addEventListener("keydown", resume, opts);
  }

  private applyLevel() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.enabled ? this.volume * LEVEL : 0, ctx.currentTime, 0.05);
  }

  /** A burst of filtered noise. */
  private burst(at: number, gain: number, seconds: number, type: BiquadFilterType, freq: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    src.connect(filter).connect(env).connect(this.master!);
    src.start(at, Math.random() * 0.4);
    src.stop(at + seconds + 0.02);
  }

  /** A low, damped knock. */
  private knock(at: number, gain: number, from: number, to: number, seconds: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + seconds * 0.6);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(env).connect(this.master!);
    osc.start(at);
    osc.stop(at + seconds + 0.02);
  }

  /** The stylus landing: a thump through the plinth and a short scuff. */
  private thump() {
    const t = this.ctx!.currentTime + 0.005;
    this.knock(t, 0.32, 75, 38, 0.26);
    this.burst(t, 0.07, 0.035, "lowpass", 1800);
    this.burst(t + 0.02, 0.025, 0.12, "bandpass", 3200);
  }

  /** The stylus leaving the groove. */
  private click(gain: number, freq: number, seconds: number) {
    const t = this.ctx!.currentTime + 0.005;
    this.burst(t, gain, seconds, "highpass", freq);
    this.knock(t, 0.06, 120, 70, 0.06);
  }

  /** The locked run-out groove: a soft swish and tick once a turn. */
  private tick() {
    const t = this.ctx!.currentTime + 0.005;
    this.burst(t, 0.1, 0.018, "bandpass", 1400);
    this.knock(t, 0.08, 110, 80, 0.05);
    this.burst(t + 0.01, 0.018, 0.4, "bandpass", 600);
  }
}
