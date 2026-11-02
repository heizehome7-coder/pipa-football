/**
 * UPDATE 7 — match sounds, made in code (no recordings, no downloads, nothing copied):
 *   KICK  — short, sharp ball strike: a low thump + a leather "click"
 *   NET   — the net swishing / rippling when a GOAL reaches it
 *   CROWD — ~3 s stadium cheer (many filtered noise "voices" + swell)
 * The buffers are synthesised once, right after the first touch/key (browsers only allow
 * audio after a user gesture), so playing them later has no delay. SOUND ON/OFF is kept
 * in localStorage. Every call is safe when audio is unavailable.
 */
const KEY = 'pipa.sound';
type Buffers = { kick: AudioBuffer; net: AudioBuffer; crowd: AudioBuffer };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let buffers: Buffers | null = null;
let muted = readMuted();
const subs = new Set<(m: boolean) => void>();

function readMuted() {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(KEY, m ? 'off' : 'on');
  } catch {
    /* private mode */
  }
  if (master) master.gain.value = m ? 0 : 0.9;
  subs.forEach((f) => f(m));
}
export function onMuted(fn: (m: boolean) => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

// ── synthesis (deterministic) ────────────────────────────────────────────
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0;
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

function makeKick(ac: BaseAudioContext) {
  const sr = ac.sampleRate;
  const n = Math.floor(sr * 0.22);
  const b = ac.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  const r = rng(7);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // body: pitch drops 160 → 55 Hz, fast decay
    const f = 55 + 105 * Math.exp(-t * 38);
    ph += (2 * Math.PI * f) / sr;
    const body = Math.sin(ph) * Math.exp(-t * 22);
    // leather click: bright noise burst for the first ~12 ms
    const noise = r() * 2 - 1;
    lp += 0.55 * (noise - lp);
    const click = (noise - lp) * Math.exp(-t * 260) * 0.9;
    d[i] = Math.tanh((body * 0.95 + click) * 1.6) * 0.9;
  }
  return b;
}

function makeNet(ac: BaseAudioContext) {
  const sr = ac.sampleRate;
  const n = Math.floor(sr * 0.75);
  const b = ac.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  const r = rng(11);
  let hp = 0;
  let prev = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const x = r() * 2 - 1;
    // band-limit: high-pass ~900 Hz then gentle low-pass ~5 kHz
    hp = 0.88 * (hp + x - prev);
    prev = x;
    lp += 0.45 * (hp - lp);
    const env = Math.min(1, t / 0.012) * Math.exp(-t * 6.5);
    const ripple = 0.65 + 0.35 * Math.sin(2 * Math.PI * (17 - t * 8) * t); // the net shaking
    d[i] = lp * env * ripple * 0.75;
  }
  return b;
}

function makeCrowd(ac: BaseAudioContext) {
  const sr = ac.sampleRate;
  const dur = 3.2;
  const n = Math.floor(sr * dur);
  const b = ac.createBuffer(2, n, sr);
  const L = b.getChannelData(0);
  const R = b.getChannelData(1);
  const r = rng(23);
  // a bed of filtered noise (the stadium) + 14 "voices" (formant-ish noise bands that swell)
  const voices = Array.from({ length: 14 }, () => ({
    f: 260 + r() * 520,
    q: 0.035 + r() * 0.04,
    start: r() * 0.35,
    len: 1.4 + r() * 1.6,
    pan: r(),
    vib: 3 + r() * 4,
    ph: 0,
    y1: 0,
    y2: 0,
  }));
  let lpA = 0;
  let lpB = 0;
  let hpP = 0;
  let hp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const swell = Math.min(1, t / 0.28) * (t < dur - 0.9 ? 1 : Math.max(0, (dur - t) / 0.9));
    const x = r() * 2 - 1;
    lpA += 0.18 * (x - lpA);
    lpB += 0.18 * (lpA - lpB);
    hp = 0.97 * (hp + lpB - hpP);
    hpP = lpB;
    const bed = hp * 1.6 * (0.8 + 0.2 * Math.sin(t * 9.1) * Math.sin(t * 2.3));
    let vl = 0;
    let vr = 0;
    for (const v of voices) {
      const local = t - v.start;
      if (local < 0 || local > v.len) continue;
      const e = Math.sin((Math.PI * local) / v.len);
      // resonator on noise → a shouted vowel-ish band
      const f = v.f * (1 + 0.03 * Math.sin(2 * Math.PI * v.vib * t));
      const w = (2 * Math.PI * f) / sr;
      const rr = 1 - v.q;
      const y = (r() * 2 - 1) * 0.08 + 2 * rr * Math.cos(w) * v.y1 - rr * rr * v.y2;
      v.y2 = v.y1;
      v.y1 = y;
      const s = y * e * 0.22;
      vl += s * (1 - v.pan);
      vr += s * v.pan;
    }
    L[i] = Math.tanh((bed * 0.55 + vl) * swell * 1.2) * 0.8;
    R[i] = Math.tanh((bed * 0.55 + vr) * swell * 1.2) * 0.8;
  }
  return b;
}

/** create the audio context + all buffers (call from a user gesture) */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    if (!buffers) buffers = { kick: makeKick(ctx), net: makeNet(ctx), crowd: makeCrowd(ctx) };
  } catch {
    ctx = null;
  }
}

/** first touch / click / key anywhere → audio ready (autoplay policy) */
export function installAudioUnlock() {
  const once = () => unlockAudio();
  window.addEventListener('pointerdown', once, { passive: true });
  window.addEventListener('touchstart', once, { passive: true });
  window.addEventListener('keydown', once);
}

const played: Record<string, number> = {};
function play(name: keyof Buffers, gain = 1, delay = 0) {
  if (muted || !ctx || !buffers || !master) return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(master);
    src.start(ctx.currentTime + delay);
    played[name] = (played[name] ?? 0) + 1;
    return true;
  } catch {
    return false;
  }
}

/** foot meets ball (power 0–1 → a little louder) */
export const playKick = (power = 0.7) => play('kick', 0.65 + 0.35 * Math.max(0, Math.min(1, power)));
/** GOAL: the ball reaches the net */
export const playNet = () => play('net', 0.9);
/** GOAL: the stadium cheers */
export const playCrowd = () => play('crowd', 0.55, 0.05);

/** a very short buzz on phones for a GOAL (ignored where unsupported, e.g. desktop) */
export function goalHaptic() {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && window.matchMedia?.('(pointer: coarse)').matches) navigator.vibrate(45);
  } catch {
    /* unsupported */
  }
}

/** test hook: how many times each sound actually started */
export const soundStats = () => ({ ...played, ready: !!buffers, muted });
if (typeof window !== 'undefined') (window as unknown as { __PIPA_SOUND?: () => unknown }).__PIPA_SOUND = soundStats;
