import { useCallback, useEffect, useRef, useState } from 'react';
import { CHORDS } from './src/chords.js';
import { DEFAULT_VOICE, VOICES, useGuitar } from './src/guitarSynth.js';

// Colors from the Figma game layout (App playground, node 39:187) and its
// fretboard (node 26:138), which build on RIFF/GOD's own palette.
const colors = {
  bgLeft: '#1C1C2C', // rgb(28,28,44)
  band: 'rgba(18,18,28,0.66)', // #12121c at 66%
  bandBorder: '#242438',
  text: '#FFFFFF',
  muted: '#BDB3E0',
  iconRing: '#FFFDF7',
  accent: '#7FDEFF',
  wrong: '#FF9EB5',
  good: '#8EF0C6',
  boardFrom: '#0B0B11',
  boardTo: '#23233C',
  fret: 'rgba(200,196,222,0.3)',
  string: '#E9E3D3',
  inlay: '#E6DFCC',
  nut: '#D9D9D9',
  tone: '#F4EEFF',
  onMarker: '#1E1C36',
  surface: '#2C2A4A',
  surfaceRaised: '#3C3B66',
  border: 'rgba(218,191,255,0.18)',
};

// Pad fills in the order the design lays them out, left to right.
const PAD_COLORS = {
  em: { base: '#7FDEFF', ink: '#1E1C36' },
  am: { base: '#8F7AD6', ink: '#FFFFFF' },
  d: { base: '#DBBEFF', ink: '#1E1C36' },
  g: { base: '#50508B', ink: '#FFFFFF' },
  c: { base: '#D9D9D9', ink: '#1E1C36' },
};

const ROUNDS = 8;
const GAP_MS = 350; // silence between chords in a played sequence
const HOLD_MS = 300; // how long the last chord's highlight lingers before the guess phase

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randomSequence(round) {
  return Array.from({ length: round }, () => Math.floor(Math.random() * CHORDS.length));
}

const isPortrait = () => window.matchMedia('(orientation: portrait)').matches;

// Best-effort fullscreen, so the game screen isn't sharing space with the
// browser's own address bar on a phone. Only Chrome/Android-family browsers
// actually grant this from a tap; iOS Safari silently ignores it (Home
// Screen install is the real fix there, offered separately). Either way it
// must be called synchronously from the click handler, or the browser
// refuses it as not being a direct user gesture.
function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  req?.call(el)?.catch?.(() => {});
}
function exitFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
  exit?.call(document)?.catch?.(() => {});
}

function usePortrait() {
  const [portrait, setPortrait] = useState(isPortrait);
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const onChange = () => setPortrait(isPortrait());
    mq.addEventListener('change', onChange);
    // Some mobile browsers are unreliable about the media-query event on rotate.
    window.addEventListener('resize', onChange);
    onChange();
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, []);
  return portrait;
}

// --- Fretboard geometry, in design pixels from the Figma frame: the board
// is 190 tall, strings sit at the node's y positions, the nut is a 12px bar,
// and fret wires repeat every 42.6px. ---
const BOARD_H = 190.25;
const STRING_Y = [20.45, 50.67, 80.9, 111.13, 141.35, 171.58];
const NUT_X = 36;
const NUT_W = 12;
const BOARD_X = NUT_X + NUT_W;
const FRET_GAP = 42.6;
const FULL_W = 1164;
const OPEN_X = 22; // open/muted markers, left of the nut
const wireX = (n) => BOARD_X + FRET_GAP * n; // n = 0 is the nut's edge
const cellMidX = (n) => (wireX(n - 1) + wireX(n)) / 2;
// Standard guitar inlays: single dots at 3, 5, 7, 9, 15…, double at 12.
const SINGLE_INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const DOUBLE_INLAYS = [12, 24];

// String thickness in design px, low E to high e.
const STRING_GAUGE = [3.2, 2.7, 2.3, 1.9, 1.5, 1.2];
const WOUND_STRINGS = 3; // low E, A and D are wound

// A quick radial ripple from a finger position as its string sounds. Two rings
// spread out and fade; they mount when the string lights, so each strum
// replays them.
const RIPPLE_CSS = `
@keyframes fret-ripple {
  from { transform: scale(1); opacity: 0.9; }
  to { transform: scale(3.2); opacity: 0; }
}
.fret-ripple {
  transform-box: fill-box;
  transform-origin: center;
  animation: fret-ripple 650ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
@media (prefers-reduced-motion: reduce) {
  .fret-ripple { animation: none; opacity: 0; }
}`;

function Ripple({ x, y, r, color }) {
  return (
    <g pointerEvents="none">
      {[0, 140].map((delay) => (
        <circle
          key={delay}
          className="fret-ripple"
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          style={{ animationDelay: `${delay}ms`, opacity: 0 }}
        />
      ))}
    </g>
  );
}

function Fretboard({ chord, lit, frets, mini = false }) {
  const width = frets ? wireX(frets) + 2 : FULL_W;
  const wireCount = Math.floor((width - BOARD_X) / FRET_GAP);
  const gradId = 'board-' + (mini ? chord.id + '-mini' : 'main');
  const midY = (STRING_Y[2] + STRING_Y[3]) / 2;
  return (
    <svg
      viewBox={`0 0 ${width} ${BOARD_H}`}
      style={mini ? styles.boardSvgMini : styles.boardSvg}
      role="img"
      aria-label={mini ? `${chord.name} chord diagram` : 'Fretboard'}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={colors.boardFrom} />
          <stop offset="100%" stopColor={colors.boardTo} />
        </linearGradient>
        {/* Strings are shaded across their thickness, dark edges to a bright
            core, so they read as round metal wire (Figma node 41:220). */}
        <linearGradient id={`${gradId}-string`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6E695C" />
          <stop offset="38%" stopColor="#FFFDF4" />
          <stop offset="62%" stopColor={colors.string} />
          <stop offset="100%" stopColor="#57534A" />
        </linearGradient>
        <linearGradient id={`${gradId}-string-lit`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2F7F9C" />
          <stop offset="38%" stopColor="#E6F9FF" />
          <stop offset="62%" stopColor={colors.accent} />
          <stop offset="100%" stopColor="#276A83" />
        </linearGradient>
        {/* The wound bass strings get fine diagonal windings on top. */}
        <pattern id={`${gradId}-winding`} width={2.4} height={4} patternUnits="userSpaceOnUse" patternTransform="skewX(-35)">
          <rect width={0.8} height={4} fill="#000" opacity={0.2} />
        </pattern>
      </defs>
      {!mini && <style>{RIPPLE_CSS}</style>}

      <rect x={BOARD_X} y={0} width={width - BOARD_X} height={BOARD_H} fill={`url(#${gradId})`} />

      {Array.from({ length: wireCount }, (_, i) => i + 1).map((n) => (
        <rect key={n} x={wireX(n) - 1.33} y={0} width={2.67} height={BOARD_H} fill={colors.fret} />
      ))}

      {SINGLE_INLAYS.filter((n) => n <= wireCount).map((n) => (
        <circle key={n} cx={cellMidX(n)} cy={midY} r={5.33} fill={colors.inlay} />
      ))}
      {DOUBLE_INLAYS.filter((n) => n <= wireCount).map((n) => (
        <g key={n}>
          <circle cx={cellMidX(n)} cy={(STRING_Y[1] + STRING_Y[2]) / 2} r={4.9} fill={colors.inlay} />
          <circle cx={cellMidX(n)} cy={(STRING_Y[3] + STRING_Y[4]) / 2} r={4.9} fill={colors.inlay} />
        </g>
      ))}

      {STRING_Y.map((y, i) => {
        const on = lit.has(i);
        const h = STRING_GAUGE[i] * (on ? 1.5 : 1);
        return (
          <g key={i}>
            <rect
              x={BOARD_X}
              y={y - h / 2}
              width={width - BOARD_X}
              height={h}
              fill={`url(#${gradId}-string${on ? '-lit' : ''})`}
              style={on ? styles.stringLit : undefined}
            />
            {i < WOUND_STRINGS && (
              <rect x={BOARD_X} y={y - h / 2} width={width - BOARD_X} height={h} fill={`url(#${gradId}-winding)`} />
            )}
          </g>
        );
      })}

      <rect x={NUT_X} y={0} width={NUT_W} height={BOARD_H} fill={colors.nut} />

      {chord.strings.map((s, i) => {
        const y = STRING_Y[i];
        const glow = lit.has(i);
        const color = s.root ? colors.accent : colors.tone;
        if (s.fret === 'x') {
          return (
            <g key={i} stroke={colors.muted} strokeWidth={2} strokeLinecap="round">
              <line x1={OPEN_X - 5} y1={y - 5} x2={OPEN_X + 5} y2={y + 5} />
              <line x1={OPEN_X - 5} y1={y + 5} x2={OPEN_X + 5} y2={y - 5} />
            </g>
          );
        }
        if (s.fret === 0) {
          return (
            <g key={i}>
              {glow && <Ripple x={OPEN_X} y={y} r={7.35} color={color} />}
              <circle
                cx={OPEN_X}
                cy={y}
                r={7.35}
                fill={glow ? color : 'none'}
                stroke={s.root ? colors.accent : colors.iconRing}
                strokeWidth={2}
                style={styles.marker}
              />
            </g>
          );
        }
        const x = cellMidX(s.fret);
        return (
          <g key={i}>
            {glow && <Ripple x={x} y={y} r={12} color={color} />}
            <circle cx={x} cy={y} r={12} fill={color} style={{ ...styles.marker, ...(glow ? styles.markerGlow : null) }} />
            {s.finger && (
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={colors.onMarker} style={styles.fingerText}>
                {s.finger}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ChordPads({ flash, disabled, answered, onPick }) {
  return (
    <div style={styles.pads}>
      {CHORDS.map((c, i) => {
        const { base, ink } = PAD_COLORS[c.id];
        // Where this chord sits in the answer so far (1-based), e.g. [1, 3].
        const picks = answered.flatMap((a, n) => (a === i ? [n + 1] : []));
        const flashing = flash.index === i;
        return (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(i)}
            aria-label={`${c.name} pad${picks.length ? `, picked ${picks.join(' and ')}` : ''}`}
            style={{
              ...styles.pad,
              background: base,
              color: ink,
              opacity: disabled && !picks.length && !flashing ? 0.45 : 1,
              animation: flashing ? 'pad-pop 380ms ease-out' : 'none',
              boxShadow: flashing
                ? `0 0 0 4px ${flash.good ? colors.good : colors.wrong}, 0 0 18px ${flash.good ? colors.good : colors.wrong}`
                : picks.length
                  ? `0 0 0 3px ${colors.text}`
                  : 'none',
            }}
          >
            {c.short}
            {picks.length > 0 && (
              <span style={styles.pickBadges} aria-hidden="true">
                {picks.map((n) => (
                  <span key={n} style={styles.pickBadge}>
                    {n}
                  </span>
                ))}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const PAD_CSS = `
@keyframes pad-pop {
  0% { transform: scale(0.92); }
  60% { transform: scale(1.04); }
  100% { transform: scale(1); }
}`;

// One chip per chord in the round. Each fills with the chord's name and color
// the moment a correct pick registers, so you can see your answer build up.
function AnswerChips({ total, answered }) {
  return (
    <span style={styles.progressRow} aria-label={`${answered.length} of ${total} chords answered`}>
      {Array.from({ length: total }, (_, i) => {
        const a = answered[i];
        if (a == null) return <span key={i} style={styles.chipEmpty} />;
        const { base, ink } = PAD_COLORS[CHORDS[a].id];
        return (
          <span key={i} style={{ ...styles.chip, background: base, color: ink }}>
            {CHORDS[a].short}
          </span>
        );
      })}
    </span>
  );
}

// Mixer-style sliders, the usual "adjust sound" glyph.
function TuneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="9" cy="6" r="2.2" fill="currentColor" />
      <circle cx="15" cy="12" r="2.2" fill="currentColor" />
      <circle cx="7" cy="18" r="2.2" fill="currentColor" />
    </svg>
  );
}

function SoundMenu({ voice, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div style={styles.menuScrim} onClick={onClose} aria-hidden="true" />
      <div style={styles.soundMenu} role="radiogroup" aria-label="Guitar sound">
        <p style={styles.menuTitle}>Guitar sound</p>
        {VOICES.map((v) => {
          const on = v.id === voice;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(v.id)}
              style={{ ...styles.menuItem, background: on ? 'rgba(127,222,255,0.14)' : 'transparent' }}
            >
              <span style={{ ...styles.menuRadio, borderColor: on ? colors.accent : colors.muted }}>
                {on && <span style={styles.menuRadioDot} />}
              </span>
              <span style={styles.menuText}>
                <span style={styles.menuName}>{v.name}</span>
                <span style={styles.menuDetail}>{v.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function HelpIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CheatSheet({ open, onClose }) {
  return (
    <>
      <div style={{ ...styles.sheetBackdrop, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }} onClick={onClose} />
      <div
        style={{ ...styles.sheet, transform: `translateY(${open ? '0%' : '100%'})` }}
        role="dialog"
        aria-modal="true"
        aria-label="Chord cheat sheet"
        aria-hidden={!open}
      >
        <div style={styles.sheetHandle} />
        <div style={styles.sheetHeader}>
          <h2 style={styles.sheetTitle}>Chord cheat sheet</h2>
          <button type="button" style={styles.linkButton} onClick={onClose}>
            Close
          </button>
        </div>
        <div style={styles.sheetGrid}>
          {CHORDS.map((c) => (
            <div key={c.id} style={styles.sheetCard}>
              <Fretboard chord={c} lit={new Set()} frets={4} mini />
              <span style={{ ...styles.sheetChip, background: PAD_COLORS[c.id].base, color: PAD_COLORS[c.id].ink }}>{c.short}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// iOS ignores the Fullscreen API entirely, so the only real way to lose the
// address bar there is adding the page to the Home Screen. Chrome/Android
// gets a real fullscreen request instead (wired up where the game starts),
// so it doesn't need this hint.
function isIOSBrowserTab() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

function IntroScreen({ onStart, onOpenCheatSheet }) {
  return (
    <div style={styles.page}>
      <div style={styles.introCard}>
        <p style={styles.eyebrow}>Ear training</p>
        <h1 style={styles.title}>Name that chord</h1>
        <p style={styles.body}>
          Each round plays a short riff of chords. Watch the fretboard light up as it strums, then press the
          matching pads in the order you heard them. Get it right and the riff grows by one chord.
        </p>
        <button type="button" style={styles.startButton} onClick={onStart}>
          Let&rsquo;s go
        </button>
        <button type="button" style={styles.linkButton} onClick={onOpenCheatSheet}>
          Chord cheat sheet
        </button>
        {isIOSBrowserTab() && (
          <p style={styles.fullscreenHint}>
            For the most space, add this to your Home Screen: Share <span aria-hidden="true">&#8594;</span> Add to
            Home Screen.
          </p>
        )}
      </div>
    </div>
  );
}

function RotatePrompt({ onClose }) {
  return (
    <div style={styles.page}>
      <div style={styles.introCard}>
        <div style={styles.rotateIcon} aria-hidden="true">
          📱↻
        </div>
        <h2 style={styles.title}>Turn your phone sideways</h2>
        <p style={styles.body}>The fretboard runs the full width of the screen, so it plays best in landscape.</p>
        <button type="button" style={styles.linkButton} onClick={onClose}>
          ← Back
        </button>
      </div>
    </div>
  );
}

const VOICE_KEY = 'name-that-chord:voice';
function savedVoice() {
  try {
    const v = localStorage.getItem(VOICE_KEY);
    return VOICES.some((x) => x.id === v) ? v : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

export default function LearnApp() {
  const [voice, setVoice] = useState(savedVoice);
  const playChord = useGuitar(voice);
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const portrait = usePortrait();
  // intro | practice | countdown | playing | done
  const [phase, setPhase] = useState('intro');
  const [countdown, setCountdown] = useState(3);
  const [round, setRound] = useState(1);
  const [status, setStatus] = useState('watch');
  const [lit, setLit] = useState(new Set());
  const [displayChord, setDisplayChord] = useState(CHORDS[0]);
  const [flash, setFlash] = useState({ index: -1, good: true });
  const [answered, setAnswered] = useState([]); // chord indices picked so far this attempt
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  const game = useRef({ seq: [], round: 1, idx: 0, accepting: false, token: 0 });
  const litTimers = useRef([]);

  const clearLitTimers = () => {
    litTimers.current.forEach(clearTimeout);
    litTimers.current = [];
  };

  const strum = useCallback(
    (chordIndex) =>
      new Promise((resolve) => {
        const chord = CHORDS[chordIndex];
        setDisplayChord(chord);
        clearLitTimers();
        playChord(chord, (stringIndex, delayMs) => {
          litTimers.current.push(setTimeout(() => setLit((prev) => new Set(prev).add(stringIndex)), delayMs));
        });
        litTimers.current.push(setTimeout(() => setLit(new Set()), 900));
        litTimers.current.push(setTimeout(resolve, 900 + HOLD_MS));
      }),
    [playChord]
  );

  const playRound = useCallback(
    async (token) => {
      const g = game.current;
      g.accepting = false;
      g.idx = 0;
      setAnswered([]);
      setStatus('watch');
      await sleep(300);
      for (let i = 0; i < g.round; i++) {
        if (token !== g.token) return;
        await strum(g.seq[i]);
        if (token !== g.token) return;
        await sleep(GAP_MS);
      }
      if (token !== g.token) return;
      g.accepting = true;
      setStatus('guess');
    },
    [strum]
  );

  const startRound = useCallback(
    (roundNum) => {
      const g = game.current;
      const token = ++g.token;
      g.round = roundNum;
      g.seq = randomSequence(roundNum);
      setRound(roundNum);
      playRound(token);
    },
    [playRound]
  );

  // Stops any riff mid-play and forgets pending round transitions.
  const stopGame = useCallback(() => {
    game.current.token++;
    game.current.accepting = false;
    clearLitTimers();
    setLit(new Set());
  }, []);

  const startGame = () => {
    enterFullscreen();
    stopGame();
    const token = game.current.token;
    setAnswered([]);
    setPhase('countdown');
    (async () => {
      for (let n = 3; n > 0; n--) {
        if (token !== game.current.token) return;
        setCountdown(n);
        await sleep(700);
      }
      if (token !== game.current.token) return;
      setPhase('playing');
      startRound(1);
    })();
  };

  const pickVoice = (id) => {
    setVoice(id);
    try {
      localStorage.setItem(VOICE_KEY, id);
    } catch {
      // Private mode: the choice just lasts for this visit.
    }
    // Let you hear the new sound, unless a riff is playing or you're answering.
    if (phase !== 'playing' && phase !== 'countdown') {
      setTimeout(() => strum(CHORDS.findIndex((c) => c.id === 'g')), 0);
    }
  };

  const backToStart = () => {
    stopGame();
    exitFullscreen();
    setCheatSheetOpen(false);
    setPhase('intro');
  };

  const onPad = useCallback(
    (chordIndex) => {
      // Before the game, a pad just plays its chord so you can learn the sound.
      if (phase === 'practice') {
        strum(chordIndex);
        return;
      }
      const g = game.current;
      if (phase !== 'playing' || !g.accepting) return;
      const correct = g.seq[g.idx] === chordIndex;
      setFlash({ index: chordIndex, good: correct });
      setTimeout(() => setFlash({ index: -1, good: true }), 450);
      // Hearing the chord you pressed confirms the tap registered.
      strum(chordIndex);

      if (!correct) {
        g.accepting = false;
        setStatus('wrong');
        const token = g.token;
        setTimeout(() => token === g.token && playRound(token), 1000);
        return;
      }

      setAnswered((prev) => [...prev, chordIndex]);
      g.idx++;
      if (g.idx < g.round) return;

      g.accepting = false;
      if (g.round === ROUNDS) {
        setStatus('done');
        setTimeout(() => setPhase('done'), 900);
        return;
      }
      setStatus('cleared');
      const nextRound = g.round + 1;
      setTimeout(() => startRound(nextRound), 800);
    },
    [phase, strum, playRound, startRound]
  );

  useEffect(() => clearLitTimers, []);

  const cheatSheet = <CheatSheet open={cheatSheetOpen} onClose={() => setCheatSheetOpen(false)} />;

  if (phase === 'intro') {
    return (
      <>
        <IntroScreen
          onStart={() => {
            enterFullscreen();
            setPhase('practice');
          }}
          onOpenCheatSheet={() => setCheatSheetOpen(true)}
        />
        {cheatSheet}
      </>
    );
  }

  if (portrait) return <RotatePrompt onClose={backToStart} />;

  let instruction;
  if (phase === 'practice') instruction = 'Tap each pad to hear its chord';
  else if (phase === 'countdown') instruction = `Get ready to listen… ${countdown}`;
  else if (phase === 'done' || status === 'done') instruction = 'You identified every chord!';
  else if (status === 'watch') instruction = `Round ${round} of ${ROUNDS} · Listen…`;
  else if (status === 'guess')
    instruction = round > 1 ? `Round ${round} of ${ROUNDS} · Your answer` : `Round ${round} of ${ROUNDS} · Which chord did you hear?`;
  else if (status === 'wrong') instruction = "Not quite, here's the riff again";
  else instruction = 'Got it!';

  const padsDisabled = phase === 'practice' ? false : !(phase === 'playing' && status === 'guess');

  return (
    <div style={styles.gamePage}>
      <header style={styles.topBar}>
        <button type="button" style={styles.newGameButton} onClick={startGame}>
          New game
        </button>
        <div style={styles.instructionWrap}>
          <div style={styles.instructionLine}>
            <p style={{ ...styles.instruction, color: status === 'wrong' && phase === 'playing' ? colors.wrong : colors.text }}>
              {instruction}
            </p>
            {phase === 'practice' && (
              <button type="button" style={styles.startPill} onClick={startGame}>
                Start
              </button>
            )}
          </div>
          {/* The chips hang below the instruction, out of the flow, so neither
              the text nor the buttons beside it move as they appear and fill. */}
          {phase === 'playing' && round > 1 && (
            <div style={styles.chipRow}>
              <AnswerChips total={round} answered={answered} />
            </div>
          )}
        </div>
        <div style={styles.topActions}>
          <button
            type="button"
            style={styles.iconButton}
            onClick={() => setSoundMenuOpen((o) => !o)}
            aria-label="Guitar sound"
            aria-expanded={soundMenuOpen}
            aria-haspopup="true"
          >
            <TuneIcon />
          </button>
          <button type="button" style={styles.iconButton} onClick={() => setCheatSheetOpen(true)} aria-label="Chord cheat sheet">
            <HelpIcon />
          </button>
        </div>
      </header>

      <div style={styles.boardRow}>
        <Fretboard chord={displayChord} lit={lit} />
      </div>

      <div style={styles.band}>
        <style>{PAD_CSS}</style>
        <ChordPads flash={flash} disabled={padsDisabled} answered={phase === 'playing' ? answered : []} onPick={onPad} />
      </div>

      {soundMenuOpen && (
        <SoundMenu
          voice={voice}
          onPick={pickVoice}
          onClose={() => setSoundMenuOpen(false)}
        />
      )}

      {phase === 'done' && (
        <div style={styles.modalBackdrop}>
          <div style={styles.modalCard} role="dialog" aria-modal="true" aria-label="Results">
            <h2 style={styles.title}>You identified every chord! 🎸</h2>
            <p style={styles.body}>All {ROUNDS} rounds, by ear.</p>
            <div style={styles.modalActions}>
              <button type="button" style={styles.startButton} onClick={startGame}>
                Play again
              </button>
              <button type="button" style={styles.linkButton} onClick={backToStart}>
                Back to start
              </button>
            </div>
          </div>
        </div>
      )}

      {cheatSheet}
    </div>
  );
}

const BOARD_MASK = 'linear-gradient(90deg, #000 80%, transparent 98%)';
const BOARD_GAP = 'clamp(14px, 6dvh, 32px)';
const TOP_BAR_H = 'calc(max(56px, 17dvh) + env(safe-area-inset-top))';
const font = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
// One flat background, the design's left-side color, so the fretboard's
// right-edge fade blends into the same color it started on.
const pageBackground = colors.bgLeft;

const styles = {
  page: {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    padding: 'max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: pageBackground,
    color: colors.text,
    fontFamily: font,
  },
  introCard: { width: '100%', maxWidth: 440, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 },
  eyebrow: { margin: 0, color: colors.accent, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { margin: 0, fontFamily: font, fontWeight: 700, fontSize: 26, letterSpacing: '-0.01em', lineHeight: 1.25, textWrap: 'balance' },
  body: { margin: 0, color: colors.muted, fontSize: 15, lineHeight: 1.55 },
  startButton: { border: 'none', borderRadius: 10, padding: '13px 30px', fontSize: 16, fontWeight: 700, color: colors.onMarker, background: colors.accent, cursor: 'pointer' },
  linkButton: { border: 'none', background: 'none', color: colors.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 0' },
  fullscreenHint: { margin: '18px 0 0', fontSize: 12, color: colors.muted, lineHeight: 1.5 },
  rotateIcon: { fontSize: 44 },

  // Landscape game screen: a top bar with room above it, the board, and the
  // pad band. The top row is taller than the design's 36px so the controls
  // aren't pressed against the top edge of a sideways phone.
  gamePage: {
    height: '100dvh',
    display: 'grid',
    gridTemplateRows: `${TOP_BAR_H} 1fr minmax(84px, 28dvh)`,
    background: pageBackground,
    color: colors.text,
    fontFamily: font,
    overflow: 'hidden',
    position: 'relative',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 'max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left))',
  },
  newGameButton: {
    flex: 'none',
    height: 28,
    padding: '0 12px',
    borderRadius: 999,
    border: `1px solid ${colors.iconRing}`,
    background: 'none',
    color: colors.iconRing,
    fontFamily: font,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  topActions: { flex: 'none', display: 'flex', alignItems: 'center', gap: 4 },
  iconButton: {
    width: 32,
    height: 32,
    flex: 'none',
    border: 'none',
    background: 'none',
    color: colors.text,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  },
  instructionWrap: { flex: 1, minWidth: 0, position: 'relative', display: 'flex', justifyContent: 'center' },
  instructionLine: { maxWidth: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 },
  instruction: { margin: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  startPill: {
    flex: 'none',
    border: 'none',
    borderRadius: 999,
    padding: '5px 16px',
    fontSize: 13,
    fontWeight: 700,
    color: colors.onMarker,
    background: colors.accent,
    cursor: 'pointer',
  },
  progressRow: { display: 'flex', gap: 3, flex: 'none' },
  chipRow: { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, display: 'flex', justifyContent: 'center' },
  chip: {
    minWidth: 20,
    height: 13,
    padding: '0 4px',
    borderRadius: 4,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    fontWeight: 700,
    lineHeight: 1,
    boxSizing: 'border-box',
  },
  chipEmpty: {
    width: 20,
    height: 13,
    borderRadius: 4,
    border: `1px dashed ${colors.muted}`,
    boxSizing: 'border-box',
    opacity: 0.7,
  },

  // Vertical padding shrinks the board and leaves breathing room between it
  // and the instructions above and the pads below.
  boardRow: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 0,
    padding: `${BOARD_GAP} 0 ${BOARD_GAP} env(safe-area-inset-left)`,
    // Full bleed: the board runs off the right edge and fades into the page.
    maskImage: BOARD_MASK,
    WebkitMaskImage: BOARD_MASK,
  },
  boardSvg: { height: '100%', width: 'auto', aspectRatio: `${FULL_W} / ${BOARD_H}`, display: 'block' },
  stringLit: { filter: `drop-shadow(0 0 3px ${colors.accent})` },
  marker: { transition: 'fill 120ms' },
  markerGlow: { filter: `drop-shadow(0 0 6px ${colors.accent})` },
  fingerText: { fontSize: 12, fontWeight: 700, fontFamily: font },

  band: {
    background: colors.band,
    borderTop: `1px solid ${colors.bandBorder}`,
    display: 'flex',
    alignItems: 'center',
    padding: '0 max(24px, env(safe-area-inset-right)) env(safe-area-inset-bottom) max(24px, env(safe-area-inset-left))',
  },
  pads: { width: '100%', height: '80%', display: 'flex', gap: 4 },
  pad: {
    flex: 1,
    minWidth: 0,
    border: 'none',
    borderRadius: 5,
    fontSize: 17,
    fontWeight: 700,
    fontFamily: font,
    cursor: 'pointer',
    position: 'relative',
    transition: 'box-shadow 150ms, opacity 120ms',
  },
  pickBadges: { position: 'absolute', top: 6, right: 6, display: 'flex', gap: 3 },
  pickBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    background: '#12121C',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 0 2px #FFFFFF',
  },

  menuScrim: { position: 'absolute', inset: 0, zIndex: 20 },
  soundMenu: {
    position: 'absolute',
    top: `calc(${TOP_BAR_H} - 4px)`,
    right: 'max(12px, env(safe-area-inset-right))',
    zIndex: 21,
    width: 240,
    maxHeight: 'calc(100dvh - 64px)',
    overflowY: 'auto',
    padding: 6,
    borderRadius: 12,
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
    fontFamily: font,
  },
  menuTitle: { margin: '6px 10px 4px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.muted },
  menuItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 10px',
    border: 'none',
    borderRadius: 8,
    color: colors.text,
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: font,
  },
  menuRadio: {
    width: 16,
    height: 16,
    flex: 'none',
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  },
  menuRadioDot: { width: 6, height: 6, borderRadius: '50%', background: colors.accent },
  menuText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  menuName: { fontSize: 14, fontWeight: 600 },
  menuDetail: { fontSize: 11, color: colors.muted },

  modalBackdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
    padding: 16,
  },
  modalCard: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: '22px 26px',
    maxWidth: 420,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  modalActions: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 6 },

  sheetBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', transition: 'opacity 200ms', zIndex: 20 },
  sheet: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88dvh',
    overflowY: 'auto',
    boxSizing: 'border-box',
    background: colors.surface,
    borderTop: `1px solid ${colors.border}`,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: '8px max(20px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))',
    transition: 'transform 260ms ease',
    zIndex: 21,
    color: colors.text,
    fontFamily: font,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 999, background: colors.border, margin: '4px auto 10px' },
  sheetHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { margin: 0, fontFamily: font, fontWeight: 700, fontSize: 18 },
  sheetGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  sheetCard: {
    background: colors.surfaceRaised,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  boardSvgMini: { width: '100%', display: 'block' },
  sheetChip: { fontSize: 13, fontWeight: 700, borderRadius: 999, padding: '3px 12px' },
};
