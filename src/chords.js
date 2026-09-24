// Five open chords worth knowing by heart, roughly in order of difficulty.
// Each string entry is one of: 'x' (muted), 0 (open), or a fretted note
// { fret, finger, root }. Strings run top-to-bottom as low E to high e,
// matching how a player sees the neck looking down at it.

export const CHORDS = [
  {
    id: 'em',
    name: 'E minor',
    short: 'Em',
    eyebrow: 'Chord library · 01',
    description: 'Two fingers, three open strings — the first chord most guitarists ever learn.',
    strings: [
      { fret: 0, root: true }, // low E
      { fret: 2, finger: 2 }, // A
      { fret: 2, finger: 3 }, // D
      { fret: 0, root: true }, // G
      { fret: 0 }, // B
      { fret: 0, root: true }, // high e
    ],
  },
  {
    id: 'am',
    name: 'A minor',
    short: 'Am',
    eyebrow: 'Chord library · 02',
    description: 'Shift Em up one string and add a finger, and the shape becomes A minor.',
    strings: [
      { fret: 'x' },
      { fret: 0, root: true }, // A
      { fret: 2, finger: 2 }, // D
      { fret: 2, finger: 3 }, // G
      { fret: 1, finger: 1 }, // B
      { fret: 0 }, // high e
    ],
  },
  {
    id: 'd',
    name: 'D major',
    short: 'D',
    eyebrow: 'Chord library · 03',
    description: 'A compact triangle of three fingers on the top three strings, with the low strings muted.',
    strings: [
      { fret: 'x' },
      { fret: 'x' },
      { fret: 0, root: true }, // D
      { fret: 2, finger: 1 }, // A
      { fret: 3, finger: 3 }, // D
      { fret: 2, finger: 2 }, // F#
    ],
  },
  {
    id: 'g',
    name: 'G major',
    short: 'G',
    eyebrow: 'Chord library · 04',
    description: 'Reach to the third fret on the outer strings, ringing all six open in between.',
    strings: [
      { fret: 3, finger: 3, root: true }, // low E
      { fret: 2, finger: 2 }, // B
      { fret: 0 }, // D
      { fret: 0, root: true }, // G
      { fret: 0 }, // B
      { fret: 3, finger: 4, root: true }, // high e
    ],
  },
  {
    id: 'c',
    name: 'C major',
    short: 'C',
    eyebrow: 'Chord library · 05',
    description: 'A three-finger stretch with the low E muted — the trickiest of the five to keep clean.',
    strings: [
      { fret: 'x' },
      { fret: 3, finger: 3, root: true }, // C
      { fret: 2, finger: 2 }, // E
      { fret: 0 }, // G
      { fret: 1, finger: 1, root: true }, // C
      { fret: 0 }, // high e
    ],
  },
];

export const FRET_COUNT = 5;
// Standard single-dot fretboard inlay in this range.
export const INLAY_FRETS = [3];
