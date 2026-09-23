import { useCallback, useEffect, useRef, useState } from 'react';
import { isOnline, joinRoom } from './src/riffNet.js';
import logoUrl from './src/assets/riff-logo.png';

// Palette: DABFFF lavender, 907AD6 purple, 4F518C indigo, 2C2A4A night, 7FDEFF sky.
// The page sits a shade darker than night (1E1C36) so night-colored cards lift off it.
const colors = {
  bg: '#1E1C36',
  surface: '#2C2A4A',
  surfaceRaised: '#3C3B66',
  text: '#F4EEFF',
  textMuted: '#BDB3E0',
  accent: '#7FDEFF',
  onAccent: '#2C2A4A',
  border: 'rgba(218,191,255,0.18)',
  // The palette has no warm tone; a soft pink reads as "oops" without clashing.
  danger: '#FF9EB5',
};

// Pad colors in play order. The first four are the core palette; the rest
// extend it for the 8- and 12-pad levels while staying distinguishable.
const PAD_COLORS = [
  { name: 'lavender', base: '#DABFFF', ink: '#2C2A4A' },
  { name: 'purple', base: '#907AD6', ink: '#2C2A4A' },
  { name: 'indigo', base: '#4F518C', ink: '#F4EEFF' },
  { name: 'sky', base: '#7FDEFF', ink: '#2C2A4A' },
  { name: 'pink', base: '#F59AC8', ink: '#2C2A4A' },
  { name: 'peach', base: '#FFC996', ink: '#2C2A4A' },
  { name: 'mint', base: '#8EF0C6', ink: '#2C2A4A' },
  { name: 'orchid', base: '#C77DDB', ink: '#2C2A4A' },
  { name: 'teal', base: '#2F8F9D', ink: '#F4EEFF' },
  { name: 'periwinkle', base: '#9AA5FF', ink: '#2C2A4A' },
  { name: 'rose', base: '#C2557A', ink: '#F4EEFF' },
  { name: 'gold', base: '#F2D16B', ink: '#2C2A4A' },
];
// 4 pads climb a C-major arpeggio; 8 and 12 walk the C-major scale, so any
// sequence still sounds musical.
const ARPEGGIO = [['C4', 261.63], ['E4', 329.63], ['G4', 392.0], ['C5', 523.25]];
const SCALE = [
  ['C4', 261.63], ['D4', 293.66], ['E4', 329.63], ['F4', 349.23], ['G4', 392.0], ['A4', 440.0],
  ['B4', 493.88], ['C5', 523.25], ['D5', 587.33], ['E5', 659.25], ['F5', 698.46], ['G5', 783.99],
];
const PAD_KEYS = '1234567890-=';

function lighten(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function makePads(count) {
  const notes = count === 4 ? ARPEGGIO : SCALE.slice(0, count);
  return notes.map(([note, freq], i) => ({
    id: PAD_COLORS[i].name,
    note,
    freq,
    base: PAD_COLORS[i].base,
    lit: lighten(PAD_COLORS[i].base, 0.55),
    ink: PAD_COLORS[i].ink,
    key: PAD_KEYS[i],
  }));
}

// Levels 3–4 are played sideways: half the pads on each side of the screen.
// start: how many notes round 1's riff has; each round adds one more.
const LEVELS = {
  1: { name: 'Rookie', blurb: '4 pads', pads: 4, tempo: 'normal', start: 1 },
  2: { name: 'Riffer', blurb: '4 pads, faster riff', pads: 4, tempo: 'fast', start: 1 },
  3: { name: 'Shredder', blurb: '8 pads, phone sideways', pads: 8, tempo: 'normal', start: 3, landscape: true, rows: 2 },
  4: { name: 'Riff God', blurb: '12 pads, phone sideways', pads: 12, tempo: 'normal', start: 4, landscape: true, rows: 3 },
};
const riffLength = (level, round) => LEVELS[level].start + round - 1;
const PADS_BY_LEVEL = Object.fromEntries(Object.entries(LEVELS).map(([lvl, l]) => [lvl, makePads(l.pads)]));
const toLevel = (value) => (LEVELS[value] ? Number(value) : 1);

const ROUNDS = 10; // default race length
const TEMPOS = {
  relaxed: { start: 620, min: 340 },
  normal: { start: 520, min: 260 },
  fast: { start: 420, min: 200 },
};
const COUNTDOWN_STEP_MS = 800;
const TAP_MS = 180;
// Grace window after the first finish, so a near-tie decided by network lag
// still goes to whoever was actually faster.
const RESULTS_GRACE_MS = 1200;
// No 0/O/1/I so codes survive being read aloud across a room.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Deterministic PRNG: every phone that gets the same seed builds the same riff.
function makeSequence(seed, rounds, padCount) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: rounds }, () => Math.floor(next() * padCount));
}

// Playback gets brisker as the riff grows.
const noteMsForRound = (round, tempo = 'normal') => {
  const t = TEMPOS[tempo] || TEMPOS.normal;
  return Math.max(t.min, t.start - round * 26);
};

// Simulated friends for the demo race. Per-note tap speed, time to react
// after the riff ends, and chance of fumbling a round (rises with length).
const BOT_NAMES = ['Maya', 'Leo', 'Priya', 'Sam', 'Jordan'];
const SKILLS = {
  easy: { tapMs: 640, reactMs: 750, slip: 0.1, slipPerRound: 0.03 },
  normal: { tapMs: 440, reactMs: 520, slip: 0.05, slipPerRound: 0.02 },
  hard: { tapMs: 320, reactMs: 380, slip: 0.03, slipPerRound: 0.012 },
  pro: { tapMs: 240, reactMs: 280, slip: 0.01, slipPerRound: 0.006 },
};
// Settings for the test-only demo page (riff-demo.html). Edit here to tune.
// skill: easy | normal | hard | pro — level: 1–4 (see LEVELS)
const DEMO_CONFIG = { friends: 3, skill: 'normal', rounds: ROUNDS, level: 1 };

// Plans one bot's whole race up front as timed events, mirroring the real
// game's pacing: watch the riff, repeat it, maybe slip and redo the round.
function planBotRace(skill, rounds, level) {
  const s = SKILLS[skill] || SKILLS.normal;
  const { tempo, pads } = LEVELS[level];
  const len = (r) => riffLength(level, r);
  // More pads means more hunting for the right one.
  const reach = 1 + (pads - 4) * 0.04;
  // Each friend gets their own pace so a same-skill pack doesn't finish in lockstep.
  const pace = 0.8 + Math.random() * 0.45;
  const jitter = (ms) => ms * pace * (0.75 + Math.random() * 0.5);
  const events = [];
  let t = 3 * COUNTDOWN_STEP_MS;
  for (let r = 1; r <= rounds; r++) {
    for (;;) {
      t += 500 + len(r) * (noteMsForRound(len(r), tempo) + 140); // watching the riff
      if (Math.random() < s.slip + s.slipPerRound * r) {
        // Fumbles partway through, buzzes, then hears the riff again.
        t += jitter(s.reactMs) + jitter(s.tapMs) * Math.floor(Math.random() * len(r));
        events.push({ at: t, msg: { type: 'slip' } });
        t += 900;
        continue;
      }
      t += jitter(s.reactMs) + jitter(s.tapMs * reach) * (len(r) - 1);
      break;
    }
    events.push({
      at: t,
      msg: r === rounds ? { type: 'finish', ms: Math.round(t - 3 * COUNTDOWN_STEP_MS) } : { type: 'progress', cleared: r },
    });
    t += 500;
  }
  return events;
}

function randomCode() {
  return Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
}

function loadName() {
  try {
    return localStorage.getItem('riff:name') || '';
  } catch {
    return '';
  }
}

function saveName(name) {
  try {
    localStorage.setItem('riff:name', name);
  } catch {
    // Private mode etc. — the name just won't be remembered.
  }
}

// Level 1 keeps the original key so earlier personal bests carry over.
const bestKey = (level) => (level === 1 ? 'riff:best' : `riff:best:${level}`);

function loadBests() {
  try {
    return Object.fromEntries(
      Object.keys(LEVELS).map((lvl) => [lvl, Number(localStorage.getItem(bestKey(Number(lvl)))) || null])
    );
  } catch {
    return {};
  }
}

function saveBest(level, ms) {
  try {
    localStorage.setItem(bestKey(level), String(ms));
  } catch {
    // Best time just won't survive a reload.
  }
}

function loadLevel() {
  try {
    return toLevel(localStorage.getItem('riff:level'));
  } catch {
    return 1;
  }
}

function saveLevel(level) {
  try {
    localStorage.setItem('riff:level', String(level));
  } catch {
    // Level choice just resets next visit.
  }
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
    // Catch a rotation that happened before this listener was attached.
    onChange();
    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, []);
  return portrait;
}

function formatMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

// The AudioContext must be created (or resumed) inside a user gesture, or
// iOS Safari keeps it silent — so it's built lazily on the first press.
function useSynth() {
  const ctxRef = useRef(null);

  return useCallback((freq, ms = 450, type = 'triangle') => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ctxRef.current = new Ctx();
    }
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;

    // Quick attack, smooth decay — avoids the click of a hard start/stop.
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === 'triangle' ? 0.35 : 0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + ms / 1000 + 0.05);
  }, []);
}

// demoMode: the test-only build (riff-demo.html) that races simulated friends.
export default function RiffMaster({ demoMode = false }) {
  const synth = useSynth();
  const [me] = useState(() => ({ id: crypto.randomUUID(), joinedAt: Date.now() }));
  const [name, setName] = useState(loadName);
  // Opened from an invite link: ?room=CODE&from=Name
  const [invite, setInvite] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room')?.toUpperCase() || '';
    return code.length === 4 ? { room: code, from: params.get('from')?.trim().slice(0, 16) || '' } : null;
  });
  const [codeInput, setCodeInput] = useState(
    () => new URLSearchParams(window.location.search).get('room')?.toUpperCase() || ''
  );
  const [room, setRoom] = useState(null); // joined room code
  const [solo, setSolo] = useState(false);
  const [demo, setDemo] = useState(null); // demo settings while racing simulated friends
  const [rounds, setRounds] = useState(ROUNDS);
  const [slips, setSlips] = useState({}); // id -> timestamp of their latest wrong note
  // Solo personal best, plus whether the run that just ended beat it.
  const [bests, setBests] = useState(loadBests);
  // level: this player's pick on the home screen (and the host's pick for a room).
  // gameLevel: the level of the race actually being played, from the start message.
  const [level, setLevelState] = useState(loadLevel);
  const [gameLevel, setGameLevel] = useState(1);
  const [roomLevel, setRoomLevel] = useState(null); // what a guest sees the host has picked
  const portrait = usePortrait();
  const [newBest, setNewBest] = useState(false);
  const [error, setError] = useState('');
  const [players, setPlayers] = useState([]);

  // 'lobby' | 'countdown' | 'playing' | 'results'
  const [phase, setPhase] = useState('lobby');
  const [countdown, setCountdown] = useState(3);
  // 'watch' | 'repeat' | 'wrong' | 'cleared' | 'done'
  const [status, setStatus] = useState('watch');
  const [round, setRound] = useState(1);
  const [progress, setProgress] = useState({}); // id -> rounds cleared
  const [finishes, setFinishes] = useState({}); // id -> ms
  const [lit, setLit] = useState({});

  const connRef = useRef(null);
  const game = useRef({
    seq: [],
    round: 1,
    rounds: ROUNDS,
    tempo: 'normal',
    level: 1,
    pads: PADS_BY_LEVEL[1],
    idx: 0,
    accepting: false,
    startedAt: 0,
    token: 0,
  });
  const botTimers = useRef([]);
  const litTimers = useRef({});
  const resultsTimer = useRef(null);

  const host = [...players].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0];
  const isHost = host?.id === me.id;

  const flash = useCallback(
    (index, ms = TAP_MS) => {
      const pad = game.current.pads[index];
      synth(pad.freq, Math.max(ms, 300));
      clearTimeout(litTimers.current[pad.id]);
      setLit((prev) => ({ ...prev, [pad.id]: true }));
      litTimers.current[pad.id] = setTimeout(() => setLit((prev) => ({ ...prev, [pad.id]: false })), ms);
    },
    [synth]
  );

  // Cancels any in-flight playback or pending round transitions.
  const stopGame = useCallback(() => {
    game.current.token++;
    game.current.accepting = false;
    botTimers.current.forEach(clearTimeout);
    botTimers.current = [];
  }, []);

  const playRound = useCallback(async () => {
    const g = game.current;
    const token = ++g.token;
    g.accepting = false;
    g.idx = 0;
    setRound(g.round);
    setStatus('watch');
    const len = riffLength(g.level, g.round);
    const noteMs = noteMsForRound(len, g.tempo);

    await sleep(500);
    for (let i = 0; i < len; i++) {
      if (token !== g.token) return;
      flash(g.seq[i], noteMs);
      await sleep(noteMs + 140);
    }
    if (token !== g.token) return;
    g.accepting = true;
    setStatus('repeat');
  }, [flash]);

  // Every game message goes through here — both ones we send and ones we receive,
  // since broadcasts don't echo back to the sender.
  const handleMessage = useCallback(
    (msg) => {
      if (msg.type === 'start') {
        stopGame();
        clearTimeout(resultsTimer.current);
        resultsTimer.current = null;
        // Mutate rather than replace: pending retries hold this object and
        // rely on its token to know they've been cancelled.
        const g = game.current;
        const token = g.token;
        const raceRounds = msg.rounds || ROUNDS;
        const raceLevel = toLevel(msg.level);
        const pads = PADS_BY_LEVEL[raceLevel];
        Object.assign(g, {
          seq: makeSequence(msg.seed, riffLength(raceLevel, raceRounds), pads.length),
          rounds: raceRounds,
          tempo: LEVELS[raceLevel].tempo,
          level: raceLevel,
          pads,
          round: 1,
          idx: 0,
        });
        setGameLevel(raceLevel);
        setProgress({});
        setFinishes({});
        setSlips({});
        setRound(1);
        setRounds(raceRounds);
        if (demo) {
          // Bot events replay through this same handler, just like a friend's messages.
          for (const bot of players.filter((p) => p.bot)) {
            for (const { at, msg: botMsg } of planBotRace(demo.skill, raceRounds, raceLevel)) {
              botTimers.current.push(setTimeout(() => handleRef.current({ ...botMsg, id: bot.id }), at));
            }
          }
        }
        setPhase('countdown');
        (async () => {
          // Sideways levels wait for the phone to turn before counting down. Each
          // phone times its own run, so a slow rotate doesn't cost anyone the race.
          // Reads the screen directly rather than React state, so it can't go stale.
          while (LEVELS[raceLevel].landscape && isPortrait()) {
            if (token !== g.token) return;
            await sleep(200);
          }
          for (let n = 3; n > 0; n--) {
            if (token !== g.token) return;
            setCountdown(n);
            await sleep(COUNTDOWN_STEP_MS);
          }
          if (token !== g.token) return;
          // Each phone times its own run from here, so the race is judged on
          // play speed, not on whose connection delivered "start" first.
          g.startedAt = performance.now();
          setPhase('playing');
          playRound();
        })();
      } else if (msg.type === 'level') {
        setRoomLevel(toLevel(msg.level));
      } else if (msg.type === 'progress') {
        setProgress((p) => ({ ...p, [msg.id]: Math.max(p[msg.id] || 0, msg.cleared) }));
      } else if (msg.type === 'slip') {
        setSlips((s) => ({ ...s, [msg.id]: Date.now() }));
      } else if (msg.type === 'finish') {
        setProgress((p) => ({ ...p, [msg.id]: game.current.rounds }));
        setFinishes((f) => ({ ...f, [msg.id]: msg.ms }));
        if (solo) {
          const lvl = game.current.level;
          const prev = bests[lvl];
          const beat = prev == null || msg.ms < prev;
          if (beat) {
            setBests((b) => ({ ...b, [lvl]: msg.ms }));
            saveBest(lvl, msg.ms);
          }
          setNewBest(beat);
        }
        if (!resultsTimer.current) {
          resultsTimer.current = setTimeout(
            () => {
              stopGame();
              setPhase('results');
            },
            // Nobody else can finish in solo, so skip the tie-break wait.
            solo ? 600 : RESULTS_GRACE_MS
          );
        }
      }
    },
    [playRound, stopGame, solo, bests, demo, players]
  );

  const handleRef = useRef(handleMessage);
  handleRef.current = handleMessage;

  const send = useCallback((msg) => {
    handleRef.current(msg);
    connRef.current?.send(msg);
  }, []);

  // Join / leave the room channel.
  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    let conn = null;
    joinRoom(room, { ...me, name: name.trim() }, {
      onPlayers: (list) => !cancelled && setPlayers(list),
      onMessage: (msg) => !cancelled && handleRef.current(msg),
      onError: (message) => !cancelled && setError(message),
    })
      .then((c) => {
        conn = c;
        if (cancelled) c.leave();
        else connRef.current = c;
      })
      .catch(() => !cancelled && setError("Couldn't join that room. Try again."));

    return () => {
      cancelled = true;
      conn?.leave();
      connRef.current = null;
      stopGame();
      clearTimeout(resultsTimer.current);
      resultsTimer.current = null;
    };
    // Name is fixed once you're in a room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, me, stopGame]);

  useEffect(() => {
    const timers = litTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  const onPad = useCallback(
    (index) => {
      const g = game.current;
      if (phase !== 'playing' || !g.accepting) return;
      flash(index);

      if (g.seq[g.idx] !== index) {
        // Wrong note: buzz, then hear this round's riff again and retry it.
        g.accepting = false;
        synth(110, 500, 'sawtooth');
        setStatus('wrong');
        send({ type: 'slip', id: me.id });
        const token = g.token;
        setTimeout(() => token === g.token && playRound(), 900);
        return;
      }

      g.idx++;
      if (g.idx < riffLength(g.level, g.round)) return;

      g.accepting = false;
      if (g.round === g.rounds) {
        setStatus('done');
        send({ type: 'finish', id: me.id, ms: Math.round(performance.now() - g.startedAt) });
        return;
      }
      send({ type: 'progress', id: me.id, cleared: g.round });
      setStatus('cleared');
      g.round++;
      const token = g.token;
      setTimeout(() => token === g.token && playRound(), 500);
    },
    [phase, flash, synth, playRound, send, me.id]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.repeat || e.target.tagName === 'INPUT') return;
      const index = game.current.pads.findIndex((p) => p.key === e.key);
      if (index >= 0) onPad(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPad]);

  const enterRoom = (code) => {
    const trimmed = name.trim();
    if (!trimmed) return setError('Enter your name first.');
    saveName(trimmed);
    setError('');
    setPlayers([]);
    setPhase('lobby');
    setRoom(code);
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    // Whoever this player shares the link with was invited by them, not the original inviter.
    url.searchParams.delete('from');
    window.history.replaceState(null, '', url);
  };

  const leaveRoom = () => {
    // Room games are also torn down by the join effect; solo has no effect to do it.
    stopGame();
    clearTimeout(resultsTimer.current);
    resultsTimer.current = null;
    setSolo(false);
    setDemo(null);
    setInvite(null);
    setRoomLevel(null);
    setRoom(null);
    setPlayers([]);
    setPhase('lobby');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    url.searchParams.delete('from');
    window.history.replaceState(null, '', url);
  };

  const setLevel = (next) => {
    setLevelState(next);
    saveLevel(next);
  };

  const startGame = (config = demo) =>
    send({
      type: 'start',
      seed: Math.floor(Math.random() * 2 ** 32),
      rounds: config?.rounds || ROUNDS,
      level: config?.level ?? level,
    });

  // The host keeps guests' lobbies in sync with the level they've picked,
  // including anyone who joins after the pick.
  useEffect(() => {
    if (room && isHost && phase === 'lobby') connRef.current?.send({ type: 'level', level });
  }, [room, isHost, phase, level, players.length]);

  // Demo race: you plus simulated friends, all local, using DEMO_CONFIG.
  const startDemo = (settings = DEMO_CONFIG) => {
    const trimmed = name.trim();
    if (trimmed) saveName(trimmed);
    setError('');
    setDemo(settings);
    const bots = BOT_NAMES.slice(0, settings.friends).map((botName, i) => ({
      id: `bot-${i}`,
      name: botName,
      joinedAt: me.joinedAt + i + 1,
      bot: true,
    }));
    setPlayers([{ ...me, name: trimmed || 'You' }, ...bots]);
  };

  // Solo skips the room entirely: no network, straight into the countdown.
  const startSolo = () => {
    const trimmed = name.trim();
    if (trimmed) saveName(trimmed);
    setError('');
    setSolo(true);
    setPlayers([{ ...me, name: trimmed || 'You' }]);
    startGame();
  };

  useEffect(() => {
    if (demo && phase === 'lobby' && players.some((p) => p.bot)) startGame(demo);
    // Kick off once, right after startDemo has put the bots in the room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, players]);

  if (demoMode && !demo) {
    return <DemoHome name={name} setName={setName} onStart={() => startDemo()} />;
  }

  if (invite && !room && !solo && !demo) {
    return (
      <InviteHome
        from={invite.from}
        name={name}
        setName={setName}
        error={error}
        onJoin={() => enterRoom(invite.room)}
        onSolo={() => {
          // Drop the invite and land on the normal home screen, name kept.
          setInvite(null);
          setCodeInput('');
          setError('');
          const trimmed = name.trim();
          if (trimmed) saveName(trimmed);
          const url = new URL(window.location.href);
          url.searchParams.delete('room');
          url.searchParams.delete('from');
          window.history.replaceState(null, '', url);
        }}
      />
    );
  }

  if (!room && !solo && !demo) {
    return (
      <Home
        name={name}
        setName={setName}
        codeInput={codeInput}
        setCodeInput={setCodeInput}
        error={error}
        onSolo={startSolo}
        level={level}
        setLevel={setLevel}
        onCreate={() => enterRoom(randomCode())}
        onJoin={() => {
          const code = codeInput.trim().toUpperCase();
          if (code.length !== 4) return setError('Room codes are 4 characters.');
          enterRoom(code);
        }}
      />
    );
  }

  const standings = rankPlayers(players, progress, finishes);
  const lvl = LEVELS[gameLevel];
  const best = bests[gameLevel];
  const needsRotate = lvl.landscape && portrait && (phase === 'countdown' || phase === 'playing');

  if (needsRotate) {
    return <RotatePrompt level={gameLevel} onLeave={leaveRoom} />;
  }

  if (phase === 'playing' && lvl.landscape) {
    const pads = PADS_BY_LEVEL[gameLevel];
    const half = pads.length / 2;
    return (
      <div style={styles.wide}>
        <PadGrid pads={pads.slice(0, half)} offset={0} rows={lvl.rows} lit={lit} disabled={status !== 'repeat'} onPad={onPad} />
        <div style={styles.wideMiddle}>
          <div style={styles.wideTop}>
            <button type="button" style={styles.linkButton} onClick={leaveRoom}>
              ← Leave
            </button>
            <span style={styles.roomTag}>{solo ? 'Solo' : demo ? 'Demo race' : `Room ${room}`}</span>
          </div>
          <div style={styles.wideMessage}>
            <p style={styles.levelTag}>
              Level {gameLevel} · {lvl.name}
            </p>
            <p style={styles.roundLabel}>
              Round {round} / {rounds}
            </p>
            <p style={{ ...styles.statusLine, color: status === 'wrong' ? colors.danger : colors.textMuted }}>
              {STATUS_COPY[status]}
            </p>
            {solo && best != null && <p style={{ ...styles.hint, marginTop: 6 }}>Best: {formatMs(best)}</p>}
          </div>
          {!solo && <Scoreboard standings={standings} meId={me.id} rounds={rounds} slips={slips} compact />}
        </div>
        <PadGrid pads={pads.slice(half)} offset={half} rows={lvl.rows} lit={lit} disabled={status !== 'repeat'} onPad={onPad} />
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <header style={styles.topBar}>
        <button type="button" style={styles.linkButton} onClick={leaveRoom}>
          ← Leave
        </button>
        <span style={styles.roomTag}>{solo ? 'Solo' : demo ? 'Demo race' : `Room ${room}`}</span>
      </header>

      {error && <p style={styles.error}>{error}</p>}

      {phase === 'lobby' && (
        <Lobby
          room={room}
          players={players}
          hostId={host?.id}
          meId={me.id}
          isHost={isHost}
          myName={name.trim()}
          level={isHost ? level : roomLevel}
          setLevel={setLevel}
          onStart={() => startGame()}
        />
      )}

      {phase === 'countdown' && (
        <div style={styles.center}>
          <p style={styles.levelTag}>
            Level {gameLevel} · {lvl.name}
          </p>
          <p style={styles.subtitle}>{solo ? `Clear all ${rounds} rounds` : `First to clear round ${rounds} wins`}</p>
          <div style={styles.countdown}>{countdown}</div>
        </div>
      )}

      {phase === 'playing' && solo && best != null && (
        <p style={styles.hint}>Best: {formatMs(best)}</p>
      )}

      {phase === 'playing' && (
        <>
          <div style={styles.center}>
            <p style={styles.levelTag}>
              Level {gameLevel} · {lvl.name}
            </p>
            <p style={styles.roundLabel}>
              Round {round} / {rounds}
            </p>
            <p style={{ ...styles.statusLine, color: status === 'wrong' ? colors.danger : colors.textMuted }}>
              {STATUS_COPY[status]}
            </p>
          </div>
          <PadGrid pads={PADS_BY_LEVEL[gameLevel]} lit={lit} disabled={status !== 'repeat'} onPad={onPad} />
          {!solo && <Scoreboard standings={standings} meId={me.id} rounds={rounds} slips={slips} />}
        </>
      )}

      {phase === 'results' && (
        solo ? (
          <SoloResults ms={finishes[me.id]} best={best} newBest={newBest} onRematch={() => startGame()} />
        ) : (
          <Results
            standings={standings}
            meId={me.id}
            rounds={rounds}
            isHost={isHost}
            onRematch={() => startGame()}
          />
        )
      )}
    </div>
  );
}

const STATUS_COPY = {
  watch: 'Watch the riff…',
  repeat: 'Your turn — play it back',
  wrong: 'Wrong note! Try this round again',
  cleared: 'Nice!',
  done: 'Finished! Waiting for results…',
};

function rankPlayers(players, progress, finishes) {
  return players
    .map((p) => ({ ...p, cleared: progress[p.id] || 0, ms: finishes[p.id] }))
    .sort((a, b) => {
      if (a.ms != null && b.ms != null) return a.ms - b.ms;
      if (a.ms != null) return -1;
      if (b.ms != null) return 1;
      return b.cleared - a.cleared;
    });
}

function Home({ name, setName, codeInput, setCodeInput, error, onSolo, level, setLevel, onCreate, onJoin }) {
  // Room options stay tucked away until asked for (or a code/error needs them).
  const [showFriends, setShowFriends] = useState(Boolean(codeInput));
  const friendsOpen = showFriends || Boolean(error && !name.trim());
  return (
    <div style={{ ...styles.page, justifyContent: 'center' }}>
      <header style={styles.center}>
        <h1 style={styles.title}>
          <img src={logoUrl} alt="RIFF/GOD" style={styles.logo} />
        </h1>
        <p style={styles.tagline}>REMEMBER RIFFS AND CHALLENGE FRIENDS</p>
      </header>

      <div style={styles.card}>
        <label style={styles.label}>
          Your name
          <input
            style={styles.input}
            value={name}
            maxLength={16}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jess"
          />
        </label>

        <LevelPicker level={level} setLevel={setLevel} />

        <button type="button" style={styles.primaryButton} onClick={onSolo}>
          Play solo
        </button>

        {!friendsOpen && (
          <button type="button" style={styles.linkButton} onClick={() => setShowFriends(true)} aria-expanded={false}>
            Play against friends
          </button>
        )}

        {friendsOpen && (
          <>
        <div style={styles.divider}>or race friends</div>

        <button type="button" style={{ ...styles.secondaryButton, width: '100%' }} onClick={onCreate}>
          Create a room
        </button>

        <form
          style={styles.joinRow}
          onSubmit={(e) => {
            e.preventDefault();
            onJoin();
          }}
        >
          <input
            style={{ ...styles.input, ...styles.codeInput }}
            value={codeInput}
            maxLength={4}
            autoCapitalize="characters"
            autoComplete="off"
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="CODE"
            aria-label="Room code"
          />
          <button type="submit" style={styles.secondaryButton}>
            Join
          </button>
        </form>
          </>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </div>

      {!isOnline && (
        <p style={styles.hint}>
          Test mode: rooms only link tabs in this browser until Supabase is configured.
        </p>
      )}
    </div>
  );
}

function InviteHome({ from, name, setName, error, onJoin, onSolo }) {
  return (
    <div style={{ ...styles.page, justifyContent: 'center' }}>
      <header style={styles.center}>
        <h1 style={styles.title}>
          <img src={logoUrl} alt="RIFF/GOD" style={styles.logo} />
        </h1>
      </header>

      <div style={styles.center}>
        <h2 style={styles.inviteHeading}>
          {from ? (
            <>
              <span style={{ color: colors.accent }}>{from}</span> invited you to race
            </>
          ) : (
            "You've been invited to race"
          )}
        </h2>
        <p style={styles.inviteRules}>Listen to the sequences, repeat them and race your friends to see who prevails.</p>
      </div>

      <form
        style={styles.card}
        onSubmit={(e) => {
          e.preventDefault();
          onJoin();
        }}
      >
        <label style={styles.label}>
          Your name
          <input
            style={styles.input}
            value={name}
            maxLength={16}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jess"
          />
        </label>
        <button type="submit" style={{ ...styles.primaryButton, width: '100%' }}>
          Join game
        </button>
        {error && <p style={styles.error}>{error}</p>}
      </form>

      <button type="button" style={styles.linkButton} onClick={onSolo}>
        Play solo instead
      </button>
    </div>
  );
}

function DemoHome({ name, setName, onStart }) {
  const c = DEMO_CONFIG;
  return (
    <div style={{ ...styles.page, justifyContent: 'center' }}>
      <header style={styles.center}>
        <h1 style={styles.title}>
          <img src={logoUrl} alt="RIFF/GOD" style={styles.logo} />
        </h1>
        <p style={styles.subtitle}>Demo race · test build</p>
      </header>

      <div style={styles.card}>
        <label style={styles.label}>
          Your name
          <input
            style={styles.input}
            value={name}
            maxLength={16}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jess"
          />
        </label>
        <p style={{ ...styles.hint, textAlign: 'left' }}>
          {c.friends} simulated {c.friends === 1 ? 'friend' : 'friends'} · {c.skill} skill · first to {c.rounds} rounds ·
          level {c.level} ({LEVELS[c.level].name})
        </p>
        <button type="button" style={{ ...styles.primaryButton, width: '100%' }} onClick={onStart}>
          Start demo race
        </button>
      </div>
    </div>
  );
}

// A race needs someone to race: Start stays locked until a friend is in the room.
const MIN_PLAYERS = 2;

function Lobby({ room, players, hostId, meId, isHost, myName, level, setLevel, onStart }) {
  const [copied, setCopied] = useState(false);
  const canStart = players.length >= MIN_PLAYERS;

  const share = async () => {
    const link = new URL(window.location.pathname, window.location.origin);
    link.searchParams.set('room', room);
    if (myName) link.searchParams.set('from', myName);
    const url = link.toString();
    const who = myName || 'A friend';
    try {
      if (navigator.share) await navigator.share({ title: 'RIFF/GOD', text: `${who} invited you to race on RIFF/GOD`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // User dismissed the share sheet.
    }
  };

  return (
    <div style={styles.lobby}>
      <div style={styles.center}>
        <p style={styles.subtitle}>Room code</p>
        <div style={styles.bigCode}>{room}</div>
        <button type="button" style={styles.linkButton} onClick={share}>
          {copied ? 'Link copied!' : 'Share invite link'}
        </button>
      </div>

      <div style={styles.card}>
        <p style={styles.label}>Players ({players.length})</p>
        <ul style={styles.playerList}>
          {players.map((p) => (
            <li key={p.id} style={styles.playerRow}>
              <span>
                {p.name}
                {p.id === meId && <span style={styles.muted}> (you)</span>}
              </span>
              {p.id === hostId && <span style={styles.badge}>Host</span>}
            </li>
          ))}
          {!canStart && (
            <li style={{ ...styles.playerRow, ...styles.muted }}>
              <span>Waiting for a friend to join…</span>
              <span style={styles.pulse} aria-hidden="true" />
            </li>
          )}
        </ul>
      </div>

      <div style={styles.card}>
        {isHost ? (
          <LevelPicker level={level} setLevel={setLevel} />
        ) : (
          <p style={{ ...styles.label, margin: 0 }}>
            {level ? `Level ${level} · ${LEVELS[level].name} — ${LEVELS[level].blurb}` : 'The host is picking a level…'}
          </p>
        )}
      </div>

      {isHost ? (
        <button
          type="button"
          style={{ ...styles.primaryButton, ...(canStart ? null : styles.buttonDisabled) }}
          disabled={!canStart}
          onClick={() => canStart && onStart()}
        >
          {canStart ? 'Start race' : 'Invite a friend to start'}
        </button>
      ) : (
        <p style={styles.hint}>Waiting for the host to start…</p>
      )}
    </div>
  );
}

function LevelPicker({ level, setLevel }) {
  const l = LEVELS[level];
  return (
    <div style={styles.label}>
      Level
      <div style={styles.segmented} role="radiogroup" aria-label="Level">
        {Object.keys(LEVELS).map((key) => {
          const n = Number(key);
          const on = n === level;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`Level ${n}, ${LEVELS[n].name}`}
              onClick={() => setLevel(n)}
              style={{ ...styles.segment, ...(on ? styles.segmentOn : null) }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <span style={styles.levelBlurb}>
        <strong style={{ color: colors.text }}>{l.name}</strong> · {l.blurb}
      </span>
    </div>
  );
}

function RotatePrompt({ level, onLeave }) {
  return (
    <div style={{ ...styles.page, justifyContent: 'center' }}>
      <div style={styles.center}>
        <div style={styles.rotateIcon} aria-hidden="true">
          📱↻
        </div>
        <h2 style={styles.winner}>Rotate your phone</h2>
        <p style={styles.subtitle}>
          Level {level} · {LEVELS[level].name} is played sideways — {LEVELS[level].pads / 2} pads on each side.
        </p>
        <p style={{ ...styles.hint, marginTop: 12 }}>The countdown starts once you turn it.</p>
      </div>
      <button type="button" style={styles.linkButton} onClick={onLeave}>
        ← Leave
      </button>
    </div>
  );
}

// offset: index of this grid's first pad in the level's full pad list.
// rows: set for the sideways levels, which size pads to fit the screen height.
function PadGrid({ pads, offset = 0, rows, lit, disabled, onPad }) {
  const wide = rows != null;
  const gap = wide ? 10 : 14;
  // Square pads as big as fits: by height (rows) or by a ~27% slice of width.
  const size = wide ? `min(calc((100dvh - 32px - ${(rows - 1) * gap}px) / ${rows}), calc((27vw - ${gap}px) / 2))` : null;
  return (
    <div
      style={
        wide
          ? { ...styles.gridBase, gap, gridTemplateColumns: `repeat(2, ${size})`, gridAutoRows: size }
          : styles.grid
      }
    >
      {pads.map((pad, i) => {
        const index = offset + i;
        return (
        <button
          key={pad.id}
          type="button"
          aria-label={`${pad.id} pad, note ${pad.note}`}
          // pointerdown fires on touch-start, so the note sounds with no lag.
          onPointerDown={(e) => {
            e.preventDefault();
            onPad(index);
          }}
          // Keyboard activation (Enter/Space on a focused pad) arrives as a
          // click with detail 0; pointer clicks were already handled above.
          onClick={(e) => {
            if (e.detail === 0) onPad(index);
          }}
          style={{
            ...styles.pad,
            ...(wide ? styles.padWide : null),
            background: lit[pad.id] ? pad.lit : pad.base,
            boxShadow: lit[pad.id] ? `0 0 36px ${pad.lit}` : 'none',
            transform: lit[pad.id] ? 'scale(0.97)' : 'scale(1)',
            opacity: disabled && !lit[pad.id] ? 0.72 : 1,
          }}
        >
          <span style={{ ...styles.note, ...(wide ? styles.noteWide : null), color: pad.ink }}>{pad.note}</span>
        </button>
        );
      })}
    </div>
  );
}

const SLIP_SHOW_MS = 1100;

function Scoreboard({ standings, meId, rounds, slips, compact = false }) {
  // Re-render shortly after a slip so its "oops" tag clears on time.
  const [, tick] = useState(0);
  const latestSlip = Math.max(0, ...Object.values(slips));
  useEffect(() => {
    const wait = latestSlip + SLIP_SHOW_MS - Date.now();
    if (wait <= 0) return;
    const t = setTimeout(() => tick((n) => n + 1), wait);
    return () => clearTimeout(t);
  }, [latestSlip]);

  return (
    <ul style={{ ...styles.playerList, ...styles.card, gap: 10, ...(compact ? styles.cardCompact : null) }}>
      {standings.map((p) => {
        const slipped = Date.now() - (slips[p.id] || 0) < SLIP_SHOW_MS;
        return (
          <li key={p.id} style={styles.scoreRow}>
            <span style={styles.scoreName}>
              {p.name}
              {p.id === meId && <span style={styles.muted}> (you)</span>}
              {slipped && <span style={styles.slipTag}> oops!</span>}
            </span>
            <div style={styles.bar}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${(p.cleared / rounds) * 100}%`,
                  background: slipped ? colors.danger : p.id === meId ? colors.accent : '#907AD6',
                }}
              />
            </div>
            <span style={styles.scoreCount}>
              {p.cleared}/{rounds}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SoloResults({ ms, best, newBest, onRematch }) {
  return (
    <div style={styles.lobby}>
      <div style={styles.center}>
        <p style={styles.subtitle}>Riff mastered! 🎸</p>
        <h2 style={styles.winner}>{formatMs(ms)}</h2>
        <p style={{ ...styles.subtitle, color: newBest ? colors.accent : colors.textMuted }}>
          {newBest ? 'New personal best!' : `Best: ${formatMs(best)}`}
        </p>
      </div>

      <button type="button" style={styles.primaryButton} onClick={onRematch}>
        Play again
      </button>
    </div>
  );
}

function Results({ standings, meId, rounds, isHost, onRematch }) {
  const winner = standings[0];
  return (
    <div style={styles.lobby}>
      <div style={styles.center}>
        <p style={styles.subtitle}>Winner</p>
        <h2 style={styles.winner}>{winner?.id === meId ? 'You win! 🎸' : `${winner?.name} wins!`}</h2>
      </div>

      <ol style={{ ...styles.playerList, ...styles.card, gap: 10 }}>
        {standings.map((p, i) => (
          <li key={p.id} style={styles.playerRow}>
            <span>
              {i + 1}. {p.name}
              {p.id === meId && <span style={styles.muted}> (you)</span>}
            </span>
            <span style={styles.muted}>{p.ms != null ? formatMs(p.ms) : `${p.cleared}/${rounds} rounds`}</span>
          </li>
        ))}
      </ol>

      {isHost ? (
        <button type="button" style={styles.primaryButton} onClick={onRematch}>
          Play again
        </button>
      ) : (
        <p style={styles.hint}>Waiting for the host to start a rematch…</p>
      )}
    </div>
  );
}

const button = {
  border: 'none',
  borderRadius: 12,
  padding: '14px 18px',
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
};

const styles = {
  page: {
    minHeight: '100dvh',
    boxSizing: 'border-box',
    padding: 'max(20px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 22,
    background: colors.bg,
    color: colors.text,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  topBar: {
    width: 'min(100%, 420px)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomTag: { color: colors.textMuted, fontSize: 14, letterSpacing: 1 },
  center: { textAlign: 'center' },
  title: { margin: 0, lineHeight: 0 },
  // The logo PNG is 244px wide; showing it at native size keeps it crisp.
  logo: { width: 'min(244px, 70vw)', height: 'auto' },
  tagline: { margin: '10px 0 0', color: colors.textMuted, fontSize: 12, fontWeight: 600, letterSpacing: 1.1 },
  subtitle: { margin: '6px 0 0', color: colors.textMuted, fontSize: 15 },
  card: {
    width: 'min(100%, 420px)',
    boxSizing: 'border-box',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  label: { display: 'flex', flexDirection: 'column', gap: 8, margin: 0, fontSize: 14, color: colors.textMuted },
  input: {
    background: colors.surfaceRaised,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: '12px 14px',
    color: colors.text,
    outline: 'none',
    minWidth: 0,
  },
  codeInput: { flex: 1, letterSpacing: 6, textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' },
  joinRow: { display: 'flex', gap: 10, margin: 0 },
  divider: { textAlign: 'center', color: colors.textMuted, fontSize: 13 },
  primaryButton: { ...button, background: colors.accent, color: colors.onAccent, width: 'min(100%, 420px)' },
  secondaryButton: { ...button, background: colors.surfaceRaised, color: colors.text, border: `1px solid ${colors.border}` },
  linkButton: { ...button, background: 'none', color: colors.accent, padding: '6px 0', fontSize: 15 },
  error: { margin: 0, color: colors.danger, fontSize: 14, textAlign: 'center' },
  hint: { margin: 0, color: colors.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 420 },
  muted: { color: colors.textMuted },
  lobby: { width: 'min(100%, 420px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 },
  bigCode: { fontSize: 56, fontWeight: 800, letterSpacing: 10, margin: '4px 0' },
  playerList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  playerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16 },
  badge: {
    fontSize: 12,
    fontWeight: 700,
    color: colors.accent,
    border: `1px solid ${colors.accent}`,
    borderRadius: 999,
    padding: '2px 8px',
  },
  countdown: { fontSize: 120, fontWeight: 800, color: colors.accent, lineHeight: 1.2 },
  roundLabel: { margin: 0, fontSize: 22, fontWeight: 700 },
  statusLine: { margin: '4px 0 0', fontSize: 15, minHeight: 20 },
  gridBase: { display: 'grid', userSelect: 'none', WebkitUserSelect: 'none', flexShrink: 0 },
  grid: {
    width: 'min(100%, 420px)',
    aspectRatio: '1',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  wide: {
    height: '100dvh',
    boxSizing: 'border-box',
    padding: '16px max(12px, env(safe-area-inset-right)) 16px max(12px, env(safe-area-inset-left))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    background: colors.bg,
    color: colors.text,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  wideMiddle: {
    flex: 1,
    minWidth: 0,
    maxWidth: 360,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  wideTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  // Takes the free space between the top bar and the scoreboard, so the round
  // and status sit in the middle of the screen.
  wideMessage: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' },
  padWide: { borderRadius: 14, padding: 8 },
  noteWide: { fontSize: 13 },
  cardCompact: { width: '100%', padding: '10px 12px', gap: 6, overflowY: 'auto', minHeight: 0 },
  levelTag: { margin: '0 0 4px', color: colors.accent, fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' },
  inviteHeading: { margin: '0 0 8px', fontSize: 24, lineHeight: 1.25 },
  inviteRules: { margin: '0 auto', color: colors.textMuted, fontSize: 15, lineHeight: 1.45, maxWidth: 340 },
  levelBlurb: { fontSize: 13, color: colors.textMuted },
  segmented: { display: 'flex', gap: 6 },
  segment: {
    ...button,
    flex: 1,
    padding: '10px 4px',
    fontSize: 15,
    background: colors.surfaceRaised,
    color: colors.textMuted,
    border: `1px solid ${colors.border}`,
  },
  segmentOn: { background: colors.accent, color: colors.onAccent, border: `1px solid ${colors.accent}` },
  rotateIcon: { fontSize: 56, marginBottom: 8, animation: 'riff-pulse 1.6s ease-in-out infinite' },
  pad: {
    // A faint rim keeps the indigo pad visible against the night background.
    border: '1px solid rgba(218,191,255,0.14)',
    borderRadius: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: 14,
    transition: 'background 80ms, box-shadow 80ms, transform 80ms, opacity 120ms',
    // Stops long-press menus and double-tap zoom from interrupting a riff.
    touchAction: 'none',
    WebkitTouchCallout: 'none',
  },
  note: { fontWeight: 700, fontSize: 18, opacity: 0.6 },
  scoreRow: { display: 'grid', gridTemplateColumns: '1fr 1.3fr auto', alignItems: 'center', gap: 10, fontSize: 14 },
  scoreName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  bar: { height: 8, background: colors.surfaceRaised, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', background: colors.accent, borderRadius: 999, transition: 'width 200ms' },
  buttonDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  pulse: {
    width: 10,
    height: 10,
    borderRadius: 999,
    background: colors.accent,
    animation: 'riff-pulse 1.2s ease-in-out infinite',
  },
  slipTag: { color: colors.danger, fontWeight: 600 },
  scoreCount: { color: colors.textMuted, fontVariantNumeric: 'tabular-nums' },
  winner: { margin: '4px 0 0', fontSize: 32 },
};
