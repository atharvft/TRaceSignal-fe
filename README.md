# TraceSignal

Prototype for AI-assisted cross-chain transaction tracing and candidate VASP identification.

## Run

```sh
npm test
npm start
```

Then open `client/index.html` in a browser. The API defaults to `http://localhost:4000` and runs in deterministic Demo Mode.

## Supabase setup

The Supabase project URL and publishable key are configured in `client/config.js`. Copy `.env.example` to `.env.local` and set the server-only `SUPABASE_SECRET_KEY`; never expose that value to the browser. Apply `supabase/migrations/001_initial.sql` in the Supabase SQL editor. The API reports `supabase: true` from `/api/health` when the server can use the project.

The first implementation slice includes the pure decision engine, privacy sanitizer, explainable deposit scoring, risk scoring, Ethereum/Tron-style demo traces, mixer/NONE handling, evidence separation, and REST endpoints for cases, traces, fixtures, and audit events.
