import { useCallback, useEffect, useRef, useState } from 'react';
import { CHORDS, FRET_COUNT, INLAY_FRETS } from './src/chords.js';

// Palette and type from the Figma fretboard-study design (node 22:325),
// carried over as-is: warm paper background, a wood-toned board, Lora for
// display type paired with Inter for everything else.
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
};

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

// Layout constants for the fretboard SVG, in its own viewBox units.
const MARGIN = 34; // room for the open/muted marks left of the nut
const NUT_W = 10;
const CELL_W = 78;
const BOARD_W = MARGIN + NUT_W + CELL_W * FRET_COUNT;
const BOARD_H = 140;
const STRING_TOP = 12;
const STRING_GAP = (BOARD_H - STRING_TOP * 2) / 5;
const stringY = (i) => STRING_TOP + STRING_GAP * i;
const fretX = (n) => MARGIN + NUT_W + CELL_W * n;
const cellMidX = (n) => fretX(n - 1) + CELL_W / 2;

function Fretboard({ chord }) {
  const woodId = 'wood-' + chord.id;
  return (
    <svg
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      style={styles.boardSvg}
      role="img"
      aria-label={`${chord.name} chord diagram`}
    >
      <defs>
        <linearGradient id={woodId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={colors.woodFrom} />
          <stop offset="48%" stopColor={colors.woodVia} />
          <stop offset="100%" stopColor={colors.woodTo} />
        </linearGradient>
      </defs>

      {/* Board */}
      <rect
        x={MARGIN + NUT_W}
        y={0}
        width={CELL_W * FRET_COUNT}
        height={BOARD_H}
        rx={4}
        fill={`url(#${woodId})`}
        stroke={colors.ink}
        strokeWidth={1.5}
      />

      {/* Frets */}
      {Array.from({ length: FRET_COUNT }, (_, i) => i + 1).map((n) => (
        <rect
          key={n}
          x={fretX(n) - 1.5}
          y={0}
          width={3}
          height={BOARD_H}
          fill={colors.fret}
          stroke={colors.fretBorder}
          strokeWidth={0.5}
        />
      ))}

      {/* Nut */}
      <rect x={MARGIN} y={0} width={NUT_W} height={BOARD_H} fill={colors.nutFill} stroke={colors.ink} />

      {/* Strings — thicker toward the low E, same as a real set. */}
      {chord.strings.map((_, i) => (
        <line
          key={i}
          x1={MARGIN}
          y1={stringY(i)}
          x2={BOARD_W}
          y2={stringY(i)}
          stroke="#e7e3d8"
          strokeWidth={0.6 + (5 - i) * 0.35}
        />
      ))}

      {/* Position inlay */}
      {INLAY_FRETS.map((n) => (
        <circle key={n} cx={cellMidX(n)} cy={stringY(2.5)} r={4.5} fill="#00000022" />
      ))}

      {/* Notes: open ring, muted cross, or a filled dot on the fretted note. */}
      {chord.strings.map((s, i) => {
        const y = stringY(i);
        const color = s.root ? colors.root : colors.ink;
        if (s.fret === 'x') {
          const x = MARGIN - 22;
          return (
            <g key={i} stroke={colors.muted} strokeWidth={1.6} strokeLinecap="round">
              <line x1={x - 4} y1={y - 4} x2={x + 4} y2={y + 4} />
              <line x1={x - 4} y1={y + 4} x2={x + 4} y2={y - 4} />
            </g>
          );
        }
        if (s.fret === 0) {
          return <circle key={i} cx={MARGIN - 22} cy={y} r={6} fill="none" stroke={color} strokeWidth={2} />;
        }
        const x = cellMidX(s.fret);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={12} fill={color} />
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

function FretNumbers() {
  return (
    <div style={styles.fretNumbers}>
      <span style={{ ...styles.fretNumber, width: MARGIN + NUT_W }}>OPEN</span>
      {Array.from({ length: FRET_COUNT }, (_, i) => i + 1).map((n) => (
        <span key={n} style={{ ...styles.fretNumber, width: CELL_W, textAlign: 'center' }}>
          {n}
        </span>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div style={styles.legend}>
      <div style={styles.legendItems}>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: colors.root }} /> Root note
        </span>
        <span style={styles.legendItem}>
          <span style={{ ...styles.legendDot, background: colors.tone }} /> Chord tone
        </span>
        <span style={styles.legendHint}>Numbers show suggested fretting fingers.</span>
      </div>
      <span style={styles.tuning}>Standard tuning · E A D G B E</span>
    </div>
  );
}

function IntroScreen({ onStart }) {
  return (
    <div style={styles.introPage}>
      <div style={styles.introCard}>
        <p style={styles.eyebrow}>Chord library</p>
        <h1 style={styles.introTitle}>Let&rsquo;s learn some chords</h1>
        <p style={styles.introBody}>
          Five open chords worth knowing by heart: {CHORDS.map((c) => c.short).join(', ')}. Turn your phone
          sideways to see each one laid out on the fretboard.
        </p>
        <div style={styles.introChips}>
          {CHORDS.map((c) => (
            <span key={c.id} style={styles.chip}>
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

function RotatePrompt() {
  return (
    <div style={styles.introPage}>
      <div style={styles.introCard}>
        <div style={styles.rotateIcon} aria-hidden="true">
          📱↻
        </div>
        <h2 style={styles.introTitle}>Turn your phone sideways</h2>
        <p style={styles.introBody}>The fretboard is wide — it reads best in landscape.</p>
      </div>
    </div>
  );
}

function BoardScreen({ index, setIndex, onHome }) {
  const chord = CHORDS[index];
  const go = useCallback(
    (delta) => setIndex((i) => (i + delta + CHORDS.length) % CHORDS.length),
    [setIndex]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  return (
    <div style={styles.boardPage}>
      <header style={styles.boardTop}>
        <button type="button" style={styles.linkButton} onClick={onHome}>
          ← Home
        </button>
        <span style={styles.roomTag}>
          {index + 1} / {CHORDS.length}
        </span>
      </header>

      <div style={styles.titleBlock}>
        <p style={styles.eyebrow}>{chord.eyebrow}</p>
        <h2 style={styles.chordTitle}>{chord.name}</h2>
        <p style={styles.chordDescription}>{chord.description}</p>
      </div>

      <Fretboard chord={chord} />
      <FretNumbers />
      <Legend />

      <div style={styles.nav}>
        <button type="button" style={styles.navButton} onClick={() => go(-1)} aria-label="Previous chord">
          ← Prev
        </button>
        <div style={styles.dots}>
          {CHORDS.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.name}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              style={{ ...styles.dot, background: i === index ? colors.root : colors.rule }}
            />
          ))}
        </div>
        <button type="button" style={styles.navButton} onClick={() => go(1)} aria-label="Next chord">
          Next →
        </button>
      </div>
    </div>
  );
}

export default function LearnApp() {
  const [phase, setPhase] = useState('intro'); // intro | rotate | board
  const [index, setIndex] = useState(0);
  const portrait = usePortrait();

  // Once past the intro, the board waits for landscape and shows itself
  // the moment the phone turns — no button needed either way.
  useEffect(() => {
    if (phase === 'rotate' && !portrait) setPhase('board');
    if (phase === 'board' && portrait) setPhase('rotate');
  }, [phase, portrait]);

  const start = () => setPhase(portrait ? 'rotate' : 'board');
  const goHome = () => setPhase('intro');

  if (phase === 'intro') return <IntroScreen onStart={start} />;
  if (phase === 'rotate') return <RotatePrompt />;
  return <BoardScreen index={index} setIndex={setIndex} onHome={goHome} />;
}

const styles = {
  introPage: {
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
  introTitle: { margin: 0, fontFamily: "'Lora', Georgia, serif", fontWeight: 500, fontSize: 32, lineHeight: 1.2 },
  introBody: { margin: 0, color: colors.muted, fontSize: 15, lineHeight: 1.55 },
  introChips: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    fontSize: 13,
    fontWeight: 600,
    color: colors.ink,
    border: `1px solid ${colors.rule}`,
    borderRadius: 999,
    padding: '4px 12px',
  },
  startButton: {
    marginTop: 6,
    border: 'none',
    borderRadius: 10,
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: 600,
    color: colors.bg,
    background: colors.ink,
    cursor: 'pointer',
  },
  rotateIcon: { fontSize: 48 },

  boardPage: {
    height: '100dvh',
    boxSizing: 'border-box',
    padding: '16px max(20px, env(safe-area-inset-right)) 16px max(20px, env(safe-area-inset-left))',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    background: colors.bg,
    color: colors.ink,
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    overflow: 'hidden',
  },
  boardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: '0 0 auto' },
  linkButton: { border: 'none', background: 'none', color: colors.root, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0 },
  roomTag: { color: colors.muted, fontSize: 13, fontVariantNumeric: 'tabular-nums' },
  titleBlock: { flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 2 },
  chordTitle: { margin: 0, fontFamily: "'Lora', Georgia, serif", fontWeight: 500, fontSize: 24 },
  chordDescription: { margin: 0, color: colors.muted, fontSize: 12.5, lineHeight: 1.4, maxWidth: 520 },
  boardSvg: { width: '100%', maxWidth: 640, alignSelf: 'center', flex: '1 1 auto', minHeight: 0 },
  fingerText: { fontSize: 11, fontWeight: 700, fontFamily: "'Inter', sans-serif" },
  fretNumbers: {
    flex: '0 0 auto',
    display: 'flex',
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    color: colors.muted,
    fontSize: 10,
    fontWeight: 600,
  },
  fretNumber: { flex: 'none' },
  legend: {
    flex: '0 0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderTop: `1px solid ${colors.rule}`,
    paddingTop: 8,
    flexWrap: 'wrap',
  },
  legendItems: { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: colors.muted },
  legendDot: { width: 10, height: 10, borderRadius: '50%', display: 'inline-block' },
  legendHint: { fontSize: 11, color: colors.muted },
  tuning: { fontFamily: "'Lora', Georgia, serif", fontStyle: 'italic', fontSize: 12, color: colors.ink },
  nav: { flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { border: 'none', background: 'none', color: colors.ink, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' },
  dots: { display: 'flex', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer' },
};
