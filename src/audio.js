import { useEffect } from 'react';

// Phones only let a page start audio from inside a tap, so the one shared
// AudioContext is created and resumed by the first tap anywhere on the page
// (see unlockAudio), not lazily when the first sound plays. Otherwise a riff
// that starts after a countdown would create it outside any tap, and iOS
// would keep it silent.
let sharedCtx = null;

export function getAudioContext() {
  if (!sharedCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    sharedCtx = new Ctx();
  }
  return sharedCtx;
}

// A short silent WAV. Playing it through an <audio> element on older iOS
// switches the page to media playback, so the silent switch doesn't mute it.
const SILENT_WAV = (() => {
  const n = 800; // 0.1 s of 8-bit mono silence at 8 kHz
  const bytes = new Uint8Array(44 + n);
  const v = new DataView(bytes.buffer);
  const text = (at, str) => [...str].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + n, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  text(36, 'data');
  v.setUint32(40, n, true);
  bytes.fill(128, 44); // 8-bit silence is the midpoint
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
})();
let silentEl = null;

// Call from inside a tap/click. Safe to call repeatedly.
export function unlockAudio() {
  // iOS 16.4+: treat this as media playback, not a UI sound, so it still
  // plays with the ring/silent switch set to silent.
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch {
    // Not supported; the <audio> fallback below covers older iOS.
  }
  const audio = getAudioContext();
  if (!audio) return;
  if (audio.state !== 'running') audio.resume().catch(() => {});
  // Playing a one-sample buffer inside the tap is what actually wakes the
  // context on older iOS; resume() alone isn't always enough there.
  const src = audio.createBufferSource();
  src.buffer = audio.createBuffer(1, 1, audio.sampleRate);
  src.connect(audio.destination);
  src.start(0);
  if (!navigator.audioSession && !silentEl) {
    silentEl = new Audio(SILENT_WAV);
    silentEl.setAttribute('playsinline', '');
    silentEl.play().catch(() => {});
  }
}

// Unlock on the first taps anywhere, and again when returning to the tab
// (iOS suspends the context when the page is backgrounded).
export function useAudioUnlock() {
  useEffect(() => {
    const events = ['pointerdown', 'touchend', 'click', 'keydown'];
    const onGesture = () => {
      unlockAudio();
      if (sharedCtx?.state === 'running') events.forEach((e) => window.removeEventListener(e, onGesture, true));
    };
    events.forEach((e) => window.addEventListener(e, onGesture, true));
    const onVisible = () => {
      if (document.visibilityState === 'visible' && sharedCtx?.state !== 'running') {
        events.forEach((e) => window.addEventListener(e, onGesture, true));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onGesture, true));
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
