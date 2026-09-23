import { useCallback, useEffect, useRef, useState } from 'react';
import { CHORDS, FRET_COUNT, INLAY_FRETS } from './src/chords.js';
import { useGuitar } from './src/guitarSynth.js';

// Palette and type carried over from the Figma fretboard-study design
// (node 22:325): warm paper background, a wood-toned board, Lora paired
// with Inter. Pad colors are new, one per chord, chosen to read clearly
// against the cream background.
const colors = {
  bg: '#f3f0e8',
  ink: '#20211f',
  muted: '#696a64',
  rule: '#c9c5ba',
  woodFrom: '#513426',
  woodVia: '#8b5a3c',
  woodTo: '#513426',
  fret: '#d8d4c8',
  fretBorder: '#7b776f',
  nutFill: '#fffdf7',
  root: '#b56543',
  tone: '#20211f',
  markerText: '#fffdf7',
  wrong: '#a4432f',
  good: '#5b7c5b',
};

const PAD_COLORS = { em: '#6f8f6a', am: '#8a5c8f', d: '#4f7d94', g: '#c9932e', c: '#b56543' };

const ROUNDS = 8;
const GAP_MS = 350; // silence between chords in a played sequence
const HOLD_MS = 300; // how long the last chord's highlight lingers before the guess phase

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randomSequence(round) {
  return Array.from({ length: round }, () => Math.floor(Math.random() * CHORDS.length));
}

// --- Fretboard, unchanged geometry from the library version, plus a `lit`
// set so a string can glow while it's sounding. ---

const MARGIN = 34;
const NUT_W = 10;
const CELL_W = 58;
const BOARD_W = MARGIN + NUT_W + CELL_W * FRET_COUNT;
const BOARD_H = 120;
const STRING_TOP = 10;
const STRING_GAP = (BOARD_H - STRING_TOP * 2) / 5;
const stringY = (i) => STRING_TOP + STRING_GAP * i;
const fretX = (n) => MARGIN + NUT_W + CELL_W * n;
const cellMidX = (n) => fretX(n - 1) + CELL_W / 2;

function Fretboard({ chord, lit }) {
  const woodId = 'wood-' + chord.id;
  return (
    <svg viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} style={styles.boardSvg} role="img" aria-label="Fretboard">
      <defs>
        <linearGradient id={woodId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={colors.woodFrom} />
          <stop offset="48%" stopColor={colors.woodVia} />
          <stop offset="100%" stopColor={colors.woodTo} />
        </linearGradient>
      </defs>

      <rect x={MARGIN + NUT_W} y={0} width={CELL_W * FRET_COUNT} height={BOARD_H} rx={4} fill={`url(#${woodId})`} stroke={colors.ink} strokeWidth={1.5} />

      {Array.from({ length: FRET_COUNT }, (_, i) => i + 1).map((n) => (
        <rect key={n} x={fretX(n) - 1.5} y={0} width={3} height={BOARD_H} fill={colors.fret} stroke={colors.fretBorder} strokeWidth={0.5} />
      ))}

      <rect x={MARGIN} y={0} width={NUT_W} height={BOARD_H} fill={colors.nutFill} stroke={colors.ink} />

      {chord.strings.map((_, i) => (
        <line key={i} x1={MARGIN} y1={stringY(i)} x2={BOARD_W} y2={stringY(i)} stroke={lit.has(i) ? colors.root : '#e7e3d8'} strokeWidth={(0.6 + (5 - i) * 0.35) * (lit.has(i) ? 1.8 : 1)} style={styles.stringLine} />
      ))}

      {INLAY_FRETS.map((n) => (
        <circle key={n} cx={cellMidX(n)} cy={stringY(2.5)} r={4} fill="#00000022" />
      ))}

      {chord.strings.map((s, i) => {
        const y = stringY(i);
        const glow = lit.has(i);
        if (s.fret === 'x') {
          const x = MARGIN - 20;
          return (
            <g key={i} stroke={colors.muted} strokeWidth={1.5} strokeLinecap="round">
              <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} />
              <line x1={x - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y - 3.5} />
            </g>
          );
        }
        if (s.fret === 0) {
          return (
            <circle
              key={i}
              cx={MARGIN - 20}
              cy={y}
              r={5.5}
              fill={glow ? (s.root ? colors.root : colors.ink) : 'none'}
              stroke={s.root ? colors.root : colors.ink}
              strokeWidth={1.8}
              style={styles.marker}
            />
          );
        }
        const x = cellMidX(s.fret);
        return (
          <g key={i} style={glow ? styles.markerGlow : undefined}>
            <circle cx={x} cy={y} r={10.5} fill={s.root ? colors.root : colors.ink} style={styles.marker} />
            {s.finger && (
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={colors.markerText} style={styles.fingerText}>
                {s.finger}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ChordPads({ progress, disabled, onPick }) {
  return (
    <div style={styles.pads}>
      {CHORDS.map((c, i) => (
        <button
          key={c.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(i)}
          style={{
            ...styles.pad,
            background: PAD_COLORS[c.id],
            opacity: disabled ? 0.55 : 1,
            transform: progress.flashIndex === i ? 'scale(0.94)' : 'scale(1)',
            boxShadow: progress.flashIndex === i ? `0 0 0 3px ${progress.flashGood ? colors.good : colors.wrong}` : 'none',
          }}
        >
          {c.short}
        </button>
      ))}
    </div>
  );
}

const STATUS_COPY = {
  watch: 'Listen…',
  guess: 'Which chords did you hear?',
  wrong: "Not quite — here's the riff again",
  cleared: 'Got it!',
  done: 'You identified every chord!',
};

function IntroScreen({ onStart }) {
  return (
    <div style={styles.page}>
      <div style={styles.introCard}>
        <p style={styles.eyebrow}>Ear training</p>
        <h1 style={styles.title}>Name that chord</h1>
        <p style={styles.body}>
          Each round plays a short riff of chords — watch the fretboard light up as it strums, then press the
          matching pads in the order you heard them. Get it right and the riff grows by one chord.
        </p>
        <div style={styles.chips}>
          {CHORDS.map((c) => (
            <span key={c.id} style={{ ...styles.chip, borderColor: PAD_COLORS[c.id], color: PAD_COLORS[c.id] }}>
              {c.short}
            </span>
          ))}
        </div>
        <button type="button" style={styles.startButton} onClick={onStart}>
          Start
        </button>
      </div>
    </div>
  );
}

function ResultsScreen({ onReplay }) {
  return (
    <div style={styles.page}>
      <div style={styles.introCard}>
        <p style={styles.eyebrow}>Ear training</p>
        <h1 style={styles.title}>You identified every chord! 🎸</h1>
        <p style={styles.body}>All {ROUNDS} rounds, by ear. Play again to mix up the riffs.</p>
        <button type="button" style={styles.startButton} onClick={onReplay}>
          Play again
        </button>
      </div>
    </div>
  );
}

export default function LearnApp() {
  const playChord = useGuitar();
  const [phase, setPhase] = useState('intro'); // intro | countdown | playing | done
  const [countdown, setCountdown] = useState(3);
  const [round, setRound] = useState(1);
  const [status, setStatus] = useState('watch');
  const [lit, setLit] = useState(new Set());
  const [displayChord, setDisplayChord] = useState(CHORDS[0]);
  const [flash, setFlash] = useState({ index: -1, good: true });

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
          litTimers.current.push(
            setTimeout(() => setLit((prev) => new Set(prev).add(stringIndex)), delayMs)
          );
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

  const start = () => {
    setPhase('countdown');
    (async () => {
      const token = game.current.token;
      for (let n = 3; n > 0; n--) {
        setCountdown(n);
        await sleep(700);
      }
      setPhase('playing');
      startRound(1);
    })();
  };

  const onPick = useCallback(
    (chordIndex) => {
      const g = game.current;
      if (!g.accepting) return;
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
    [playRound, startRound]
  );

  useEffect(() => clearLitTimers, []);

  if (phase === 'intro') return <IntroScreen onStart={start} />;
  if (phase === 'done') return <ResultsScreen onReplay={start} />;

  if (phase === 'countdown') {
    return (
      <div style={styles.page}>
        <div style={styles.introCard}>
          <p style={styles.body}>Get ready to listen…</p>
          <div style={styles.countdown}>{countdown}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.gamePage}>
      <header style={styles.top}>
        <button type="button" style={styles.linkButton} onClick={() => setPhase('intro')}>
          ← Quit
        </button>
        <span style={styles.roundTag}>
          Round {round} / {ROUNDS}
        </span>
      </header>

      <p style={{ ...styles.status, color: status === 'wrong' ? colors.wrong : colors.muted }}>{STATUS_COPY[status]}</p>

      <Fretboard chord={displayChord} lit={lit} />

      <ChordPads progress={{ flashIndex: flash.index, flashGood: flash.good }} disabled={status !== 'guess'} onPick={onPick} />
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    padding: 'max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: colors.bg,
    color: colors.ink,
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  introCard: { maxWidth: 420, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 },
  eyebrow: { margin: 0, color: colors.root, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { margin: 0, fontFamily: "'Lora', Georgia, serif", fontWeight: 500, fontSize: 30, lineHeight: 1.25, textWrap: 'balance' },
  body: { margin: 0, color: colors.muted, fontSize: 15, lineHeight: 1.55 },
  chips: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { fontSize: 13, fontWeight: 700, borderRadius: 999, border: '1.5px solid', padding: '4px 12px' },
  startButton: { marginTop: 6, border: 'none', borderRadius: 10, padding: '14px 32px', fontSize: 16, fontWeight: 600, color: colors.bg, background: colors.ink, cursor: 'pointer' },
  countdown: { fontSize: 72, fontWeight: 800, color: colors.root, marginTop: 8 },

  gamePage: {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    padding: 'max(20px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 18,
    background: colors.bg,
    color: colors.ink,
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  top: { width: '100%', maxWidth: 520, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  linkButton: { border: 'none', background: 'none', color: colors.root, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0 },
  roundTag: { color: colors.muted, fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  status: { margin: 0, fontSize: 15, fontWeight: 600, minHeight: 20 },
  boardSvg: { width: '100%', maxWidth: 420 },
  stringLine: { transition: 'stroke 120ms, stroke-width 120ms' },
  marker: { transition: 'fill 120ms' },
  markerGlow: { filter: `drop-shadow(0 0 5px ${colors.root})` },
  fingerText: { fontSize: 10, fontWeight: 700, fontFamily: "'Inter', sans-serif" },
  pads: { width: '100%', maxWidth: 420, display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  pad: {
    // Three pads per row, so five wrap 3-then-2 instead of an uneven 4-then-1.
    flex: '0 1 calc(33.333% - 7px)',
    minWidth: 70,
    border: 'none',
    borderRadius: 14,
    padding: '18px 8px',
    fontSize: 17,
    fontWeight: 700,
    color: '#fffdf7',
    cursor: 'pointer',
    transition: 'transform 120ms, box-shadow 120ms, opacity 120ms',
  },
};
