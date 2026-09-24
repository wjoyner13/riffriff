import { useCallback, useRef } from 'react';

// Synthesizes plucked-guitar-string audio with Karplus-Strong physical
// modeling — no recordings or network fetches, just noise fed through a
// decaying delay loop tuned to each string's pitch. It's a well-known trick
// (used in real trackers and pedals) for a convincing pluck from pure math.

// Standard tuning, open-string frequencies, low E to high e — same string
// order as src/chords.js.
const OPEN_FREQ = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

export const stringFreq = (stringIndex, fret) => OPEN_FREQ[stringIndex] * 2 ** (fret / 12);

// Each voice is a set of Karplus-Strong knobs plus an output chain:
//   decay      how long the string rings (closer to 1 = longer)
//   seconds    length of the rendered pluck
//   soften     smoothing passes over the noise burst; more = duller, rounder attack
//   stagger    ms between strings in a strum
//   octaves    also pluck an octave-up partner string, as on a 12-string
//   chain      extra processing between the strings and the speakers
export const VOICES = [
  { id: 'acoustic', name: 'Acoustic', detail: 'Steel-string, bright and open', decay: 0.9955, seconds: 1.1, soften: 0, stagger: 14, gain: 1, chain: 'body' },
  { id: 'electric', name: 'Electric', detail: 'Clean, long sustain', decay: 0.998, seconds: 1.8, soften: 1, stagger: 12, gain: 0.9, chain: 'clean' },
  { id: 'overdrive', name: 'Overdrive', detail: 'Electric through a gritty amp', decay: 0.9985, seconds: 1.8, soften: 1, stagger: 10, gain: 0.55, chain: 'drive' },
  { id: 'nylon', name: 'Nylon', detail: 'Classical, soft and warm', decay: 0.9965, seconds: 1.3, soften: 3, stagger: 22, gain: 1.15, chain: 'warm' },
  { id: 'twelve', name: '12-string', detail: 'Doubled strings, shimmering', decay: 0.9955, seconds: 1.2, soften: 0, stagger: 16, gain: 0.7, chain: 'body', octaves: true },
];
export const DEFAULT_VOICE = 'acoustic';
const voiceById = (id) => VOICES.find((v) => v.id === id) || VOICES[0];

// One Karplus-Strong pluck as raw samples: a burst of noise the length of one
// wave cycle, replayed through a shrinking, low-pass-filtered ring buffer.
function pluckSamples(sampleRate, freq, voice) {
  const period = Math.max(2, Math.round(sampleRate / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;
  // A softer pick (or a fingertip on nylon) has less high-end in the attack.
  for (let pass = 0; pass < voice.soften; pass++) {
    for (let i = 0; i < period; i++) ring[i] = 0.5 * (ring[i] + ring[(i + 1) % period]);
  }

  const length = Math.round(sampleRate * voice.seconds);
  const out = new Float32Array(length);
  let idx = 0;
  for (let n = 0; n < length; n++) {
    const next = (idx + 1) % period;
    out[n] = ring[idx];
    ring[idx] = voice.decay * 0.5 * (ring[idx] + ring[next]);
    idx = next;
  }
  return out;
}

// Soft-clipping curve for the overdrive voice.
function driveCurve(amount) {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

// Builds the node chain a voice plays through and returns its input node.
function buildChain(audio, kind) {
  const input = audio.createGain();
  const filter = (type, frequency, q = 0.7, gain = 0) => {
    const f = audio.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    f.gain.value = gain;
    return f;
  };
  let chain;
  if (kind === 'drive') {
    const pre = audio.createGain();
    pre.gain.value = 6;
    const shaper = audio.createWaveShaper();
    shaper.curve = driveCurve(3);
    shaper.oversample = '4x';
    // A speaker cabinet rolls off the fizz above ~4 kHz.
    chain = [filter('highpass', 90), pre, shaper, filter('lowpass', 3800, 0.9), filter('peaking', 800, 1, 3)];
  } else if (kind === 'clean') {
    chain = [filter('lowpass', 5200), filter('peaking', 1200, 0.8, 2)];
  } else if (kind === 'warm') {
    chain = [filter('lowpass', 2600), filter('peaking', 220, 1, 3)];
  } else {
    // Acoustic body resonance around 110 Hz and a little presence.
    chain = [filter('peaking', 110, 1.2, 3), filter('peaking', 2500, 1, 2)];
  }
  [input, ...chain].reduce((a, b) => a.connect(b)).connect(audio.destination);
  return input;
}

// The AudioContext must be created (or resumed) inside a user gesture, or
// iOS Safari keeps it silent — so it's built lazily on first use, and both
// it and the caches live in refs so they survive re-renders.
export function useGuitar(voiceId = DEFAULT_VOICE) {
  const ctxRef = useRef(null);
  const buffersRef = useRef(new Map()); // `${voice}:${freq}` -> AudioBuffer, built once and reused
  const chainsRef = useRef(new Map()); // chain kind -> input node
  const voiceRef = useRef(voiceId);
  voiceRef.current = voiceId;

  return useCallback((chord, onString) => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ctxRef.current = new Ctx();
    }
    const audio = ctxRef.current;
    if (audio.state === 'suspended') audio.resume();
    const voice = voiceById(voiceRef.current);

    const bufferFor = (freq) => {
      const key = `${voice.id}:${freq}`;
      const buffers = buffersRef.current;
      let buf = buffers.get(key);
      if (!buf) {
        buf = audio.createBuffer(1, Math.round(audio.sampleRate * voice.seconds), audio.sampleRate);
        buf.copyToChannel(pluckSamples(audio.sampleRate, freq, voice), 0);
        buffers.set(key, buf);
      }
      return buf;
    };
    let out = chainsRef.current.get(voice.chain);
    if (!out) {
      out = buildChain(audio, voice.chain);
      chainsRef.current.set(voice.chain, out);
    }

    const pluck = (freq, when, level) => {
      const source = audio.createBufferSource();
      source.buffer = bufferFor(freq);
      const gain = audio.createGain();
      gain.gain.value = level;
      source.connect(gain).connect(out);
      source.start(when);
    };

    // Plays every un-muted string of `chord`, low to high with a strum's
    // worth of stagger, and calls onString(index, delayMs) as each one lands
    // so the caller can light it up on the fretboard in sync.
    chord.strings.forEach((s, i) => {
      if (s.fret === 'x') return;
      const delayMs = i * voice.stagger;
      const freq = stringFreq(i, s.fret === 0 ? 0 : s.fret);
      const when = audio.currentTime + delayMs / 1000;
      // Lower strings carry more energy in a real strum; keep the sum under 1.
      const level = (0.16 + (5 - i) * 0.01) * voice.gain;
      pluck(freq, when, level);
      if (voice.octaves) {
        // 12-string courses: the four low strings get an octave partner, the
        // top two a unison partner, struck a hair later and slightly detuned.
        const partner = i < 4 ? freq * 2 * 1.002 : freq * 1.003;
        pluck(partner, when + 0.006, level * 0.7);
      }
      onString?.(i, delayMs);
    });
  }, []);
}
