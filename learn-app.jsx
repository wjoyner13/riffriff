import { useCallback, useEffect, useRef, useState } from 'react';
import { CHORDS } from './src/chords.js';
import { useGuitar } from './src/guitarSynth.js';

// Colors from the Figma game layout (App playground, node 39:187) and its
// fretboard (node 26:138), which build on RIFF/GOD's own palette.
const colors = {
  bgLeft: '#1C1C2C', // rgb(28,28,44)
  bgRight: '#2E2039', // rgb(46,32,57)
  fade: '#1E1C36', // rgb(30,28,54), the board's right-edge fade
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
      </defs>

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

      {STRING_Y.map((y, i) => (
        <line
          key={i}
          x1={BOARD_X}
          y1={y}
          x2={width}
          y2={y}
          stroke={lit.has(i) ? colors.accent : colors.string}
          strokeWidth={(1 + (5 - i) * 0.25) * (lit.has(i) ? 1.8 : 1)}
          style={styles.stringLine}
        />
      ))}

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
            <circle
              key={i}
              cx={OPEN_X}
              cy={y}
              r={7.35}
              fill={glow ? color : 'none'}
              stroke={s.root ? colors.accent : colors.iconRing}
              strokeWidth={2}
              style={styles.marker}
            />
          );
        }
        const x = cellMidX(s.fret);
        return (
          <g key={i} style={glow ? styles.markerGlow : undefined}>
            <circle cx={x} cy={y} r={12} fill={color} style={styles.marker} />
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

function ChordPads({ flash, disabled, onPick }) {
  return (
    <div style={styles.pads}>
      {CHORDS.map((c, i) => {
        const { base, ink } = PAD_COLORS[c.id];
        return (
          <button
            key={c.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(i)}
            aria-label={`${c.name} pad`}
            style={{
              ...styles.pad,
              background: base,
              color: ink,
              opacity: disabled ? 0.45 : 1,
              transform: flash.index === i ? 'scale(0.95)' : 'scale(1)',
              boxShadow: flash.index === i ? `0 0 0 3px ${flash.good ? colors.good : colors.wrong}` : 'none',
            }}
          >
            {c.short}
          </button>
        );
      })}
    </div>
  );
}

// One dot per chord in the round, filling with that chord's color the moment
// a correct pick registers.
function ProgressDots({ total, answered }) {
  return (
    <span style={styles.progressRow} aria-label={`${answered.length} of ${total} chords answered`}>
      {Array.from({ length: total }, (_, i) => {
        const a = answered[i];
        const color = a != null ? PAD_COLORS[CHORDS[a].id].base : 'transparent';
        return <span key={i} style={{ ...styles.progressSlot, background: color, borderColor: a != null ? color : colors.muted }} />;
      })}
    </span>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
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

export default function LearnApp() {
  const playChord = useGuitar();
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

  const backToStart = () => {
    stopGame();
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
      setTimeout(() => setFlash({ index: -1, good: true }), 220);

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
        <IntroScreen onStart={() => setPhase('practice')} onOpenCheatSheet={() => setCheatSheetOpen(true)} />
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
  else if (status === 'guess') instruction = `Round ${round} of ${ROUNDS} · Which chords did you hear?`;
  else if (status === 'wrong') instruction = "Not quite, here's the riff again";
  else instruction = 'Got it!';

  const padsDisabled = phase === 'practice' ? false : !(phase === 'playing' && status === 'guess');

  return (
    <div style={styles.gamePage}>
      <header style={styles.topBar}>
        <button type="button" style={styles.closeButton} onClick={backToStart} aria-label="Back to the start">
          <CloseIcon />
        </button>
        <div style={styles.instructionWrap}>
          <p style={{ ...styles.instruction, color: status === 'wrong' && phase === 'playing' ? colors.wrong : colors.text }}>
            {instruction}
          </p>
          {phase === 'practice' && (
            <button type="button" style={styles.startPill} onClick={startGame}>
              Start
            </button>
          )}
          {phase === 'playing' && round > 1 && <ProgressDots total={round} answered={answered} />}
        </div>
        <button type="button" style={styles.helpButton} onClick={() => setCheatSheetOpen(true)} aria-label="Chord cheat sheet">
          <HelpIcon />
        </button>
      </header>

      <div style={styles.boardRow}>
        <Fretboard chord={displayChord} lit={lit} />
        <div style={styles.boardFade} aria-hidden="true" />
      </div>

      <div style={styles.band}>
        <ChordPads flash={flash} disabled={padsDisabled} onPick={onPad} />
      </div>

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

const font = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";
// The design's background: purple on the right, deep navy on the left.
const pageBackground = `linear-gradient(-89.45deg, ${colors.bgRight} 5.93%, ${colors.bgLeft} 71.75%)`;

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
  title: { margin: 0, fontFamily: "'Lora', Georgia, serif", fontWeight: 500, fontSize: 28, lineHeight: 1.25, textWrap: 'balance' },
  body: { margin: 0, color: colors.muted, fontSize: 15, lineHeight: 1.55 },
  startButton: { border: 'none', borderRadius: 10, padding: '13px 30px', fontSize: 16, fontWeight: 700, color: colors.onMarker, background: colors.accent, cursor: 'pointer' },
  linkButton: { border: 'none', background: 'none', color: colors.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 0' },
  rotateIcon: { fontSize: 44 },

  // Landscape game screen, laid out on the design's 327px-tall grid:
  // a 36px top bar, a 190px board, and a 92px pad band.
  gamePage: {
    height: '100dvh',
    display: 'grid',
    gridTemplateRows: 'minmax(40px, 11dvh) 1fr minmax(84px, 28dvh)',
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
    padding: '0 max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left))',
  },
  closeButton: {
    width: 28,
    height: 28,
    flex: 'none',
    borderRadius: '50%',
    border: `1px solid ${colors.iconRing}`,
    background: 'none',
    color: colors.iconRing,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
  },
  helpButton: {
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
  instructionWrap: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 },
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
  progressRow: { display: 'inline-flex', gap: 6, flex: 'none' },
  progressSlot: { width: 10, height: 10, borderRadius: '50%', border: '2px solid', transition: 'background 150ms' },

  // Full bleed: the board runs off the right edge, clipped and faded.
  boardRow: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 0,
    paddingLeft: 'env(safe-area-inset-left)',
  },
  boardSvg: { height: '100%', width: 'auto', aspectRatio: `${FULL_W} / ${BOARD_H}`, display: 'block' },
  boardFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '18%',
    background: `linear-gradient(90deg, rgba(30,28,54,0) 0%, ${colors.fade} 73%)`,
    pointerEvents: 'none',
  },
  stringLine: { transition: 'stroke 120ms, stroke-width 120ms' },
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
    transition: 'transform 120ms, box-shadow 120ms, opacity 120ms',
  },

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
  sheetTitle: { margin: 0, fontFamily: "'Lora', Georgia, serif", fontWeight: 500, fontSize: 20 },
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
