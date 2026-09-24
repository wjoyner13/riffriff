import { useCallback, useEffect, useRef, useState } from 'react';
import { CHORDS, FRET_COUNT, INLAY_FRETS } from './src/chords.js';
import { useGuitar } from './src/guitarSynth.js';

// RIFF/GOD's own palette (riff-master.jsx): night background, lavender/
// purple/indigo/sky as the core ramp, extended with pink for a 5th chord.
const colors = {
  bg: '#1E1C36',
  surface: '#2C2A4A',
  surfaceRaised: '#3C3B66',
  text: '#F4EEFF',
  muted: '#BDB3E0',
  border: 'rgba(218,191,255,0.18)',
  accent: '#7FDEFF', // sky — root notes, links, the accent everywhere
  onAccent: '#1E1C36',
  wrong: '#FF9EB5', // RIFF/GOD's own "danger" pink
  good: '#8EF0C6', // from RIFF/GOD's extended level palette
  boardFrom: '#4F518C',
  boardVia: '#907AD6',
  boardTo: '#4F518C',
  fret: 'rgba(244,238,255,0.35)',
  nutFill: '#F4EEFF',
};

// One pad per chord, straight from RIFF/GOD's pad ramp; ink is the readable
// text color for each swatch (dark on the light ones, light on the dark).
const PAD_COLORS = {
  em: { base: '#DABFFF', ink: '#1E1C36' },
  am: { base: '#907AD6', ink: '#F4EEFF' },
  d: { base: '#4F518C', ink: '#F4EEFF' },
  g: { base: '#7FDEFF', ink: '#1E1C36' },
  c: { base: '#F59AC8', ink: '#1E1C36' },
};

const ROUNDS = 8;
const GAP_MS = 350; // silence between chords in a played sequence
const HOLD_MS = 300; // how long the last chord's highlight lingers before the guess phase

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function randomSequence(round) {
  return Array.from({ length: round }, () => Math.floor(Math.random() * CHORDS.length));
}

// --- Fretboard: same geometry as before, recolored to the RIFF/GOD ramp,
// plus a `lit` set so a string glows while it's sounding. ---

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

function Fretboard({ chord, lit, compact }) {
  const woodId = 'board-' + chord.id + (compact ? '-mini' : '');
  return (
    <svg viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} style={compact ? styles.boardSvgMini : styles.boardSvg} role="img" aria-label="Fretboard">
      <defs>
        <linearGradient id={woodId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={colors.boardFrom} />
          <stop offset="48%" stopColor={colors.boardVia} />
          <stop offset="100%" stopColor={colors.boardTo} />
        </linearGradient>
      </defs>

      <rect x={MARGIN + NUT_W} y={0} width={CELL_W * FRET_COUNT} height={BOARD_H} rx={4} fill={`url(#${woodId})`} stroke={colors.bg} strokeWidth={1.5} />

      {Array.from({ length: FRET_COUNT }, (_, i) => i + 1).map((n) => (
        <rect key={n} x={fretX(n) - 1.5} y={0} width={3} height={BOARD_H} fill={colors.fret} />
      ))}

      <rect x={MARGIN} y={0} width={NUT_W} height={BOARD_H} fill={colors.nutFill} stroke={colors.bg} />

      {chord.strings.map((_, i) => (
        <line
          key={i}
          x1={MARGIN}
          y1={stringY(i)}
          x2={BOARD_W}
          y2={stringY(i)}
          stroke={lit.has(i) ? colors.accent : 'rgba(244,238,255,0.55)'}
          strokeWidth={(0.6 + (5 - i) * 0.35) * (lit.has(i) ? 1.8 : 1)}
          style={styles.stringLine}
        />
      ))}

      {INLAY_FRETS.map((n) => (
        <circle key={n} cx={cellMidX(n)} cy={stringY(2.5)} r={4} fill="rgba(30,28,54,0.35)" />
      ))}

      {chord.strings.map((s, i) => {
        const y = stringY(i);
        const glow = lit.has(i);
        const color = s.root ? colors.accent : colors.text;
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
              fill={glow ? color : 'none'}
              stroke={color}
              strokeWidth={1.8}
              style={styles.marker}
            />
          );
        }
        const x = cellMidX(s.fret);
        return (
          <g key={i} style={glow ? styles.markerGlow : undefined}>
            <circle cx={x} cy={y} r={10.5} fill={color} style={styles.marker} />
            {s.finger && (
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={colors.bg} style={styles.fingerText}>
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
            style={{
              ...styles.pad,
              background: base,
              color: ink,
              opacity: disabled ? 0.5 : 1,
              transform: flash.index === i ? 'scale(0.94)' : 'scale(1)',
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

// Fills in one slot per chord in the round as an answer registers, so a
// multi-chord round shows visible progress instead of just waiting.
function ProgressRow({ total, answered }) {
  return (
    <div style={styles.progressRow} aria-label={`${answered.length} of ${total} chords answered`}>
      {Array.from({ length: total }, (_, i) => {
        const a = answered[i];
        const color = a != null ? PAD_COLORS[CHORDS[a].id].base : 'transparent';
        return <span key={i} style={{ ...styles.progressSlot, background: color, borderColor: a != null ? color : colors.border }} />;
      })}
    </div>
  );
}

function CheatSheet({ open, onClose }) {
  return (
    <>
      <div style={{ ...styles.sheetBackdrop, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }} onClick={onClose} />
      <div style={{ ...styles.sheet, transform: `translateY(${open ? '0%' : '100%'})` }} role="dialog" aria-label="Chord cheat sheet" aria-hidden={!open}>
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
              <Fretboard chord={c} lit={new Set()} compact />
              <span style={{ ...styles.sheetChip, background: PAD_COLORS[c.id].base, color: PAD_COLORS[c.id].ink }}>{c.short}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

const STATUS_COPY = {
  watch: 'Listen…',
  guess: 'Which chords did you hear?',
  wrong: "Not quite — here's the riff again",
  cleared: 'Got it!',
  done: 'You identified every chord!',
};

function IntroScreen({ onStart, onPreview, previewChord, previewLit, onOpenCheatSheet }) {
  return (
    <div style={styles.page}>
      <div style={styles.introCard}>
        <p style={styles.eyebrow}>Ear training</p>
        <h1 style={styles.title}>Name that chord</h1>
        <p style={styles.body}>
          Each round plays a short riff of chords — watch the fretboard light up as it strums, then press the
          matching pads in the order you heard them. Get it right and the riff grows by one chord.
        </p>

        <div style={styles.practiceBlock}>
          <p style={styles.practiceLabel}>Tap a pad to hear it first</p>
          <Fretboard chord={previewChord} lit={previewLit} />
          <ChordPads flash={{ index: -1, good: true }} disabled={false} onPick={onPreview} />
        </div>

        <button type="button" style={styles.startButton} onClick={onStart}>
          Start
        </button>
        <button type="button" style={styles.linkButton} onClick={onOpenCheatSheet}>
          Chord cheat sheet
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
          litTimers.current.push(
            setTimeout(() => setLit((prev) => new Set(prev).add(stringIndex)), delayMs)
          );
        });
        litTimers.current.push(setTimeout(() => setLit(new Set()), 900));
        litTimers.current.push(setTimeout(resolve, 900 + HOLD_MS));
      }),
    [playChord]
  );

  // Tapping a pad before the game starts (or anywhere it's wired up) just
  // plays and lights that chord — no round logic involved.
  const preview = useCallback((chordIndex) => strum(chordIndex), [strum]);

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

  const start = () => {
    setPhase('countdown');
    (async () => {
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

      // Registers the tap immediately, so a multi-chord round visibly fills
      // in as you go instead of leaving you guessing whether it landed.
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
    [playRound, startRound]
  );

  useEffect(() => clearLitTimers, []);

  if (phase === 'intro') {
    return (
      <>
        <IntroScreen onStart={start} onPreview={preview} previewChord={displayChord} previewLit={lit} onOpenCheatSheet={() => setCheatSheetOpen(true)} />
        <CheatSheet open={cheatSheetOpen} onClose={() => setCheatSheetOpen(false)} />
      </>
    );
  }
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

      {round > 1 && <ProgressRow total={round} answered={answered} />}

      <ChordPads flash={flash} disabled={status !== 'guess'} onPick={onPick} />

      <button type="button" style={styles.linkButton} onClick={() => setCheatSheetOpen(true)}>
        Chord cheat sheet
      </button>
      <CheatSheet open={cheatSheetOpen} onClose={() => setCheatSheetOpen(false)} />
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
    color: colors.text,
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  introCard: { width: '100%', maxWidth: 420, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 },
  eyebrow: { margin: 0, color: colors.accent, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { margin: 0, fontFamily: "'Lora', Georgia, serif", fontWeight: 500, fontSize: 30, lineHeight: 1.25, textWrap: 'balance' },
  body: { margin: 0, color: colors.muted, fontSize: 15, lineHeight: 1.55 },
  practiceBlock: {
    width: '100%',
    boxSizing: 'border-box',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  practiceLabel: { margin: 0, fontSize: 12.5, fontWeight: 600, color: colors.muted },
  startButton: { marginTop: 6, border: 'none', borderRadius: 10, padding: '14px 32px', fontSize: 16, fontWeight: 700, color: colors.onAccent, background: colors.accent, cursor: 'pointer' },
  countdown: { fontSize: 72, fontWeight: 800, color: colors.accent, marginTop: 8 },

  gamePage: {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    padding: 'max(20px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    background: colors.bg,
    color: colors.text,
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  top: { width: '100%', maxWidth: 520, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  linkButton: { border: 'none', background: 'none', color: colors.accent, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0 },
  roundTag: { color: colors.muted, fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  status: { margin: 0, fontSize: 15, fontWeight: 600, minHeight: 20 },
  boardSvg: { width: '100%', maxWidth: 420 },
  boardSvgMini: { width: '100%', maxWidth: 200 },
  stringLine: { transition: 'stroke 120ms, stroke-width 120ms' },
  marker: { transition: 'fill 120ms' },
  markerGlow: { filter: `drop-shadow(0 0 6px ${colors.accent})` },
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
    cursor: 'pointer',
    transition: 'transform 120ms, box-shadow 120ms, opacity 120ms',
  },
  progressRow: { display: 'flex', gap: 8 },
  progressSlot: { width: 14, height: 14, borderRadius: '50%', border: '2px solid', transition: 'background 150ms' },
  sheetBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    transition: 'opacity 200ms',
    zIndex: 20,
  },
  sheet: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80dvh',
    overflowY: 'auto',
    boxSizing: 'border-box',
    background: colors.surface,
    borderTop: `1px solid ${colors.border}`,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: '10px 20px max(20px, env(safe-area-inset-bottom))',
    transition: 'transform 260ms ease',
    zIndex: 21,
    color: colors.text,
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 999, background: colors.border, margin: '4px auto 12px' },
  sheetHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { margin: 0, fontFamily: "'Lora', Georgia, serif", fontWeight: 500, fontSize: 20 },
  sheetGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 },
  sheetCard: {
    background: colors.surfaceRaised,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  sheetChip: { fontSize: 13, fontWeight: 700, borderRadius: 999, padding: '3px 12px' },
};
