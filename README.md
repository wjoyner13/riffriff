# RIFF/GOD

A Simon-style note game: four colored pads, each playing a note. Play
solo, or race friends to clear the last round first.

- `index.html` / `src/main.jsx` — the game
- `riff-demo.html` / `src/riff-demo-main.jsx` — a test-only page that races
  simulated friends locally, for trying out multiplayer without other
  phones. Settings are the `DEMO_CONFIG` constant in `riff-master.jsx`.
- `riff-master.jsx` — game UI and logic
- `src/riffNet.js` — room transport: Supabase Realtime if
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set, else
  BroadcastChannel (same-browser tabs only, for local dev)

## Setup

```
npm install
cp .env.example .env   # fill in your Supabase project's URL + anon key
npm run dev
```

## Deploy

Netlify: connect this repo, build command `npm run build`, publish dir
`dist`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as
environment variables on the site.
