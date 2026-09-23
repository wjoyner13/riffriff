import { useCallback, useRef } from 'react';

// Synthesizes plucked-guitar-string audio with Karplus-Strong physical
// modeling — no recordings or network fetches, just noise fed through a
// decaying delay loop tuned to each string's pitch. It's a well-known trick
// (used in real trackers and pedals) for a convincing pluck from pure math.

// Standard tuning, open-string frequencies, low E to high e — same string
// order as src/chords.js.
const OPEN_FREQ = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];

export const stringFreq = (stringIndex, fret) => OPEN_FREQ[stringIndex] * 2 ** (fret / 12);

const PLUCK_SECONDS = 1.1;
const DECAY = 0.9955;
// Real strums aren't simultaneous — each string lands a beat after the last.
export const STRUM_STAGGER_MS = 14;

// One Karplus-Strong pluck as raw samples: a burst of noise the length of one
// wave cycle, replayed through a shrinking, low-pass-filtered ring buffer.
function pluckSamples(sampleRate, freq) {
  const period = Math.max(2, Math.round(sampleRate / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = Math.random() * 2 - 1;

  const length = Math.round(sampleRate * PLUCK_SECONDS);
  const out = new Float32Array(length);
  let idx = 0;
  for (let n = 0; n < length; n++) {
    const next = (idx + 1) % period;
    out[n] = ring[idx];
    ring[idx] = DECAY * 0.5 * (ring[idx] + ring[next]);
    idx = next;
  }
  return out;
}

// The AudioContext must be created (or resumed) inside a user gesture, or
// iOS Safari keeps it silent — so it's built lazily on first use, and both
// it and the buffer cache live in refs so they survive re-renders.
export function useGuitar() {
  const ctxRef = useRef(null);
  const buffersRef = useRef(new Map()); // freq -> AudioBuffer, built once and reused

  return useCallback((chord, onString) => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ctxRef.current = new Ctx();
    }
    const audio = ctxRef.current;
    if (audio.state === 'suspended') audio.resume();

    const bufferFor = (freq) => {
      const buffers = buffersRef.current;
      let buf = buffers.get(freq);
      if (!buf) {
        buf = audio.createBuffer(1, Math.round(audio.sampleRate * PLUCK_SECONDS), audio.sampleRate);
        buf.copyToChannel(pluckSamples(audio.sampleRate, freq), 0);
        buffers.set(freq, buf);
      }
      return buf;
    };

    // Plays every un-muted string of `chord`, low to high with a strum's
    // worth of stagger, and calls onString(index, delayMs) as each one lands
    // so the caller can light it up on the fretboard in sync.
    chord.strings.forEach((s, i) => {
      if (s.fret === 'x') return;
      const delayMs = i * STRUM_STAGGER_MS;
      const freq = stringFreq(i, s.fret === 0 ? 0 : s.fret);
      const source = audio.createBufferSource();
      source.buffer = bufferFor(freq);
      const gain = audio.createGain();
      // Lower strings carry more energy in a real strum; keep the sum under 1.
      gain.gain.value = 0.16 + (5 - i) * 0.01;
      source.connect(gain).connect(audio.destination);
      source.start(audio.currentTime + delayMs / 1000);
      onString?.(i, delayMs);
    });
  }, []);
}
