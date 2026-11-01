// Every sound in the harbour is synthesised with Web Audio, so there are no files to load.
// Browsers only allow audio after a tap, so nothing plays until the player first touches the page.

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let waves: GainNode | undefined;
let muted = (() => { try { return localStorage.getItem('portside:muted') === '1'; } catch { return false; } })();
const listeners = new Set<(m: boolean) => void>();

function noiseBuffer(c: AudioContext, seconds: number, brown = false) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    d[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w;
  }
  return buf;
}

/** Slow surf: brown noise through a low-pass whose level rolls in and out like waves. */
function startWaves(c: AudioContext, out: AudioNode) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 6, true);
  src.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 520;
  waves = c.createGain();
  waves.gain.value = 0.16;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.11;
  const depth = c.createGain();
  depth.gain.value = 0.09;
  lfo.connect(depth).connect(waves.gain);
  src.connect(lp).connect(waves).connect(out);
  src.start(); lfo.start();
}

function unlock() {
  if (ctx) { ctx.resume(); return; }
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  startWaves(ctx, master);
}
if (typeof window !== 'undefined') window.addEventListener('pointerdown', unlock, { passive: true });

function tone(type: OscillatorType, from: number, to: number, start: number, dur: number, vol: number, out?: AudioNode) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, start);
  o.frequency.exponentialRampToValueAtTime(to, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.03, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(out ?? master);
  o.start(start); o.stop(start + dur + 0.05);
}

export const sfx = {
  get muted() { return muted; },
  setMuted(m: boolean) {
    muted = m;
    try { localStorage.setItem('portside:muted', m ? '1' : '0'); } catch { /* private window */ }
    if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
    listeners.forEach((f) => f(m));
  },
  subscribe(f: (m: boolean) => void) { listeners.add(f); return () => { listeners.delete(f); }; },

  /** A ship's horn: two slightly detuned low saws through a soft filter. */
  horn(long = false) {
    if (!ctx || !master) return;
    const t = ctx.currentTime, dur = long ? 2.2 : 1.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.12);
    g.gain.setValueAtTime(0.32, t + dur - 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(master);
    for (const f of [98, 98.7, 147]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
  },
  /** Countdown tick; the last three seconds are higher and louder. */
  tick(urgent: boolean) {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone('square', urgent ? 1320 : 880, urgent ? 1300 : 860, t, 0.07, urgent ? 0.12 : 0.06);
  },
  splash() {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 1.2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(300, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    tone('sine', 180, 50, t, 0.35, 0.35);
  },
  /** A handful of coins landing; more coins for a bigger win. */
  coins(n = 6) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const s = t + i * 0.07 + Math.random() * 0.03, f = 2200 + Math.random() * 1400;
      tone('triangle', f, f * 0.98, s, 0.18, 0.09);
      tone('sine', f * 1.5, f * 1.5, s, 0.1, 0.04);
    }
  },
  /** One coin for someone else's trade at the piers. */
  clink() {
    if (!ctx) return;
    const t = ctx.currentTime, f = 2600 + Math.random() * 600;
    tone('triangle', f, f, t, 0.12, 0.035);
  },
  lose() {
    if (!ctx) return;
    const t = ctx.currentTime;
    tone('triangle', 392, 196, t, 0.35, 0.16);
    tone('triangle', 330, 147, t + 0.28, 0.55, 0.16);
  },
  fanfare() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, t + i * 0.11, i === 3 ? 0.6 : 0.16, 0.14));
  },
};
