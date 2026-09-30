# PRD: AI-Powered Cross-Chain Transaction Tracing & VASP Identification

**SIH 2026 | PS ID: SIH26182 | Team: TheParalysed_22 (ID 134273)**
**Stack:** React (frontend) · Node.js + Express (backend) · Supabase (Postgres, Auth, Storage)
**Goal of this document:** a build-ready spec for a working, deployed prototype with a public URL for PPT submission.

---

## 1. Product Summary

An investigator enters a suspect wallet address (as if received from a SAHYOG case). The system traces outgoing funds hop by hop, detects mixers (and flags bridges), finds the **nearest exchange/custodial (VASP) deposit endpoint** on each path, and scores the match using **path evidence** and **identity evidence** separately. It outputs a confidence level (HIGH / MEDIUM / LOW / NONE), a risk score, and an investigation-ready report. The investigator confirms or rejects before a (mock) SAHYOG request is generated.

**Core principles (from the slides, must be visible in the UI):**
1. AI suggests, evidence decides, human confirms.
2. Path evidence and identity evidence are scored separately.
3. Never claim ownership: a VASP match is a *candidate*.
4. If nothing reliable is found, say **"No Reliable VASP Found"** and list what was checked.
5. Every result logs data sources and timestamps so it can be re-run.
6. Only wallet addresses go to external APIs, never personal case data.

## 2. Goals and Non-Goals

**Goals (prototype)**
- Trace Ethereum and Tron wallets forward across multiple hops.
- Bitcoin address clustering demo (common-input-ownership heuristic).
- Mixer / CoinJoin detection with confidence penalty.
- Bridge/swap contract detection (flagged as weak path link; full matching is Phase 3).
- Candidate VASP matching, AI-assisted scoring, decision engine per the HIGH/MEDIUM/LOW/NONE rules.
- Dashboard with fund-movement graph, evidence, confidence, risk score.
- Investigator review, exportable report (PDF + JSON), mock SAHYOG routing.
- Validation page implementing the Phase 4 testing plan (hidden-label recovery + false-positive count).
- Audit log of data sources and timestamps; re-run capability.

**Non-goals**
- Live SAHYOG integration (mock interface only, per slides).
- Real commercial intelligence API (Chainalysis/TRM/Elliptic). Build a modular adapter with a mock implementation.
- Solana full support, real bridge-to-bridge matching, privacy-chain (Monero) handling. Listed as roadmap/future scope.
- Any personal or KYC data handling.

> **Honest scope note:** BNB Chain and Polygon are EVM chains, so once Ethereum works they can be enabled with a config entry. Include them as a stretch goal (Phase 2), not a blocker.

## 3. Users and Roles

| Role | Description | Permissions |
|---|---|---|
| Investigator (LEA) | Creates cases, runs traces, reviews and confirms | CRUD own cases, confirm/reject, generate SAHYOG request |
| Supervisor / Admin | Manages VASP database and users | All investigator rights + manage VASP DB, view all cases, view audit log |

Auth via Supabase Auth (email + password). Role stored in a `profiles` table; enforced with Row Level Security and Express middleware.

## 4. Key User Flow (maps to slide 5 "Case Workflow")

1. **Suspect wallet**: investigator creates a case (SAHYOG intake mock form: case ref, chain, wallet address, notes).
2. **Trace**: system builds transaction graph, traces forward across hops.
3. **Evidence + score**: path evidence and identity evidence generated and scored separately, then confidence + risk score.
4. **Investigator confirms**: reviews candidates, evidence, adds notes, confirms or rejects.
5. **SAHYOG request**: after confirmation, a request package (report + evidence) is generated and "routed" via mock SAHYOG endpoint.
6. **VASP acts**: mock status tracking (Sent → Acknowledged → Action taken) to demo the closed loop.

## 5. Functional Requirements

### FR-1: Case Intake (SAHYOG mock)
- Form: case reference number, chain (Ethereum / Tron / Bitcoin), wallet address, optional incident date, optional amount, notes.
- Address validation per chain (regex + checksum where feasible: EIP-55 for ETH, Base58Check for Tron/BTC).
- Mock SAHYOG endpoint `POST /api/sahyog/intake` accepts a JSON payload, so slide claim "API intake; mock in prototype" is real and demonstrable. Include a "Simulate incoming SAHYOG case" button that creates a case from a fixture.

### FR-2: Transaction Graph and Forward Tracing
- Fetch outgoing transactions for the address from chain data providers (see Section 8).
- BFS forward trace with configurable limits: `max_hops` (default 5), `max_fanout` per node (default 10, keep top by value), `min_value` dust threshold (default equivalent of ~$10; dust is excluded from ranking).
- Track **share of funds** along each path (proportional allocation: if a node splits outputs, each path inherits share proportional to value).
- Stop expanding a branch when it hits: a known VASP address, a mixer, a bridge contract, or max hops.
- Store nodes and edges in Supabase; graph rendered in frontend.

### FR-3: Mixer, CoinJoin and Cross-Chain Detection
- **Mixers:** maintain `mixer_addresses` list (e.g., Tornado Cash contracts on Ethereum, known Tron mixer/tumbler addresses) and match against nodes. On hit: path flagged `MIXER`, confidence lowered, investigator alerted (red banner). Path ending at mixer ⇒ contributes to NONE.
- **Bitcoin CoinJoin heuristic:** transaction with many inputs and many equal-value outputs flagged as CoinJoin-like; common-input-ownership clustering is disabled on such transactions.
- **Bridges/swaps:** maintain `bridge_contracts` list (known bridge/DEX router addresses). On hit: path flagged `BRIDGE_SWAP`; treated as **weak path link** unless an on-chain confirmation exists. Amount + time candidate on the destination chain shown as "possible continuation" only.

### FR-4: Evidence Extraction
Each evidence item is a row with `type` (PATH or IDENTITY), `subtype`, `strength`, `source`, `raw_ref` (tx hash / address / label ID), `timestamp`.

**Path evidence:** transaction flow, amount and timing, hop sequence, cross-chain links.
**Identity evidence** (each counts as an *independent source* only if it comes from a different `source_id`):
1. `KNOWN_VASP_DB`: address exists in the curated `vasp_addresses` table.
2. `COMMERCIAL_LABEL`: label from an intelligence provider adapter (mock provider in prototype, real provider pluggable).
3. `CLUSTER`: address belongs to a cluster containing a known VASP address (BTC common-input heuristic; EVM sweep-pattern clustering).
4. `DEPOSIT_BEHAVIOR`: ML/rule classifier says the address behaves like an exchange deposit address (see FR-5).
5. `EXPLORER_LABEL` (optional): public explorer tag where an API provides it.

### FR-5: AI-Assisted Scoring
- **Deposit-address behavior classifier** features: number of distinct senders, ratio of inbound to outbound tx, sweep behaviour (funds forwarded to a single address soon after receipt), balance-near-zero pattern, forward-to-known-VASP-hot-wallet rate, account age, tx count.
- Implementation options (pick one, in order of effort):
  a. Weighted logistic scoring in Node with weights fitted offline from a labeled set (simple, explainable). **Recommended.**
  b. Small Python microservice (scikit-learn) called by Express. Only if time permits.
- Output: `p_deposit` in 0–1 and top contributing features (explainability shown in UI).
- **Risk score (0–100):** combines mixer exposure, bridge hops, fan-out/peeling behaviour, speed of movement, and sanctioned/known-bad label hits (if any). Displayed as a gauge (green→red).
- The AI score can *add* an identity evidence item (`DEPOSIT_BEHAVIOR`) but can never by itself produce HIGH.

### FR-6: Candidate VASP Matching and Decision Engine
- **Nearest VASP** = first exchange or custodial deposit endpoint on each path. Candidates ranked by **share of funds**, then **fewer hops**. Dust transfers not ranked.
- Decision table (implement exactly as a pure, unit-tested function):

| Confidence | Rule |
|---|---|
| HIGH | Path fully traced AND ≥2 independent identity sources agree |
| MEDIUM | Path fully traced with 1 identity source, OR ≥2 sources with one weak path link |
| LOW | Weak path link AND ≤1 source, OR endpoint found with 0 sources, OR sources conflict (route to investigator review) |
| NONE | No endpoint found, OR path ends at a mixer ⇒ "No Reliable VASP Found" + list of what was checked |

- **Weak path link** = a hop matched only by amount and timing, an ambiguous split, or a bridge/swap link with no on-chain confirmation.
- "What was checked" list on NONE: hops traversed, addresses visited, data sources queried, labels searched, mixers/bridges encountered, timestamps.

### FR-7: Dashboard and Case View
- **Case list:** filter by status (New, Tracing, Awaiting Review, Confirmed, Rejected, Sent).
- **Case detail page** with panels:
  1. Interactive fund-movement graph (zoom, pan, click node for details; colour by type: suspect, intermediate, VASP, mixer, bridge; edge thickness = value share; flagged edges in red).
  2. Candidate VASP table: VASP name, address, confidence badge, share of funds, hops, evidence count.
  3. Evidence panel with two clearly separated columns: **Path Evidence** and **Identity Evidence**, each with per-item source and timestamp.
  4. Risk score gauge and AI feature explanation.
  5. Alerts (mixer detected, bridge detected, conflicting sources).
  6. "No Reliable VASP Found" state with the checked-items list.
- Live trace progress (status polling or Supabase Realtime).

### FR-8: Investigator Review
- Confirm or reject each candidate; mandatory note on reject; optional note on confirm.
- Only confirmed candidates can proceed to SAHYOG request. LOW/NONE require an extra acknowledgement checkbox.
- Every action written to the audit log.

### FR-9: Report Generation
- Investigation-ready report containing: case details, wallet, transaction path table, graph image, candidates with confidence, path/identity evidence, risk score, "what was checked", data sources and timestamps, investigator name and decision, disclaimer ("candidate attribution, not proof of ownership").
- Export as **PDF** and **JSON**.

### FR-10: SAHYOG Routing (mock)
- After confirmation: "Send to SAHYOG" creates a `sahyog_requests` row with the report attached and calls the mock endpoint `POST /api/sahyog/route`.
- Mock lifecycle: `SENT → ACKNOWLEDGED → ACTION_TAKEN` (advance via an admin "simulate VASP response" button so the demo shows the whole loop).
- SAHYOG client sits behind an interface so a real API can replace the mock.

### FR-11: VASP Address Database (Admin)
- CRUD UI for `vasp_addresses` (VASP name, chain, address, type: EXCHANGE / CUSTODIAL, source, source_url, added_at).
- CSV bulk import.
- Seed with publicly documented exchange hot/deposit wallets for ETH/Tron/BTC (Binance, Coinbase, OKX, KuCoin, etc.), each with a source URL. **Verify each address from a public source before seeding; do not invent addresses.**

### FR-12: Validation Module (Phase 4 testing plan)
- Admin page: select a held-out set of known exchange addresses, **hide their labels**, run the trace/identification on wallets that are known to deposit to them, then report:
  - Recovery rate (how many the tool recovers)
  - False-positive count
  - Confidence distribution
- Downloadable results table. Include a one-click "Run validation" that uses a bundled fixture so it works in the demo without live APIs.

### FR-13: Audit Log and Re-run
- Every external API call logged: provider, endpoint, address queried, response hash, timestamp.
- "Re-run trace" reproduces a trace from cached responses (frozen snapshot) and can also do a fresh run to compare.
- Audit viewer page with filters (case, user, action, date).

### FR-14: Privacy Guardrails
- External API adapters accept only wallet addresses/tx hashes. A `sanitize()` function strips everything else and is unit-tested.
- Case notes and investigator names never leave the backend.

## 6. Non-Functional Requirements

- **Reliability for demo:** every live provider call has a cache (Supabase table `api_cache`) and a fixture fallback. **Demo Mode** toggle uses fixtures only, so a rate-limited or offline API cannot break the presentation.
- **Performance:** typical trace (depth 4, fanout 10) returns first graph in under ~30 s; progressive rendering as hops complete.
- **Security:** Supabase RLS on all tables, JWT verification in Express, helmet, CORS allow-list, rate limiting, input validation (zod), secrets only in env vars.
- **Explainability:** every score shows how it was derived.
- **Accessibility/UI:** responsive, keyboard-friendly, colour-blind-safe confidence badges (icon + text, not colour only).

## 7. System Architecture

```
React (Vite) ──HTTPS──> Express API ──> Supabase (Postgres/Auth/Storage)
                          │
                          ├─ Chain Providers (adapters): Etherscan V2 (EVM), TronGrid/Tronscan, mempool.space/Blockstream (BTC)
                          ├─ Intelligence Adapter: Mock provider (default) | real provider (pluggable)
                          ├─ Tracing Engine (BFS, share-of-funds)
                          ├─ Detection (mixer, CoinJoin, bridge)
                          ├─ Scoring (AI features, risk, decision engine)
                          ├─ Report Service (PDF/JSON)
                          └─ SAHYOG Mock Service
```

Long traces run as background jobs inside Express (in-process queue such as `p-queue`); progress is written to `traces.status/progress` and read by the UI. No separate worker is required for the prototype.

## 8. Data Sources

| Chain | Provider (free tier) | Use |
|---|---|---|
| Ethereum (+ BNB, Polygon later) | Etherscan API V2 (one key, `chainid` param) | Normal tx, internal tx, token transfers |
| Tron | TronGrid / Tronscan API | TRX and TRC-20 (USDT) transfers |
| Bitcoin | mempool.space or Blockstream Esplora API (no key) | Tx inputs/outputs for clustering |
| Labels | Curated `vasp_addresses` + mock commercial adapter | Identity evidence |

> Check each provider's current rate limits and terms before building. Design adapters with retry, backoff, and caching regardless.

**Adapter interface (all chains):**
```
getTransactions(address, {fromTime, limit}) -> NormalizedTx[]
getAddressProfile(address) -> {firstSeen, txCount, inCount, outCount, distinctSenders, balance}
```
`NormalizedTx = { chain, hash, from, to, value, asset, timestamp, blockNumber, isContract, method }`

## 9. Database Schema (Supabase / Postgres)

```sql
profiles(id uuid pk references auth.users, full_name, role text check (role in ('investigator','admin')), created_at)

cases(id uuid pk, case_ref text, chain text, wallet_address text, incident_date date, amount numeric,
      notes text, status text, created_by uuid, created_at, updated_at)

traces(id uuid pk, case_id uuid fk, status text, progress int, params jsonb,  -- max_hops, fanout, dust
       started_at, finished_at, snapshot_hash text, error text)

graph_nodes(id uuid pk, trace_id fk, chain, address, node_type text,  -- SUSPECT|INTERMEDIATE|VASP|MIXER|BRIDGE
            hop int, vasp_id uuid null, cluster_id text null, meta jsonb)

graph_edges(id uuid pk, trace_id fk, from_node fk, to_node fk, tx_hash, value numeric, asset text,
            ts timestamptz, share numeric, link_strength text,  -- STRONG|WEAK
            flags text[])

vasp_addresses(id uuid pk, vasp_name, chain, address, type text, source text, source_url, added_by, added_at,
               is_holdout boolean default false)

mixer_addresses(id, chain, address, name, source_url)
bridge_contracts(id, chain, address, name, source_url)

evidence(id uuid pk, trace_id fk, candidate_id fk null, category text,  -- PATH|IDENTITY
         subtype text, strength numeric, source_id text, raw_ref text, description text, created_at)

candidates(id uuid pk, trace_id fk, vasp_id fk, address, share numeric, hops int,
           confidence text,  -- HIGH|MEDIUM|LOW|NONE
           p_deposit numeric, risk_score int, explanation jsonb, rank int)

trace_summary(trace_id pk, result text,  -- CANDIDATES|NO_RELIABLE_VASP
              checked jsonb,  -- hops, addresses, sources, mixers/bridges seen
              risk_score int)

reviews(id, candidate_id fk, reviewer uuid, decision text, note text, created_at)
sahyog_requests(id, case_id fk, candidate_id fk, report_path text, status text, created_by, created_at, updated_at)
api_cache(key text pk, provider, response jsonb, fetched_at)
audit_log(id, user_id, action text, entity text, entity_id, provider text, details jsonb, ts timestamptz default now())
validation_runs(id, run_by, params jsonb, recovered int, total int, false_positives int, results jsonb, ts)
```

RLS: investigators see only their cases (`created_by = auth.uid()`); admins see all; reference tables (vasp/mixer/bridge) are read-only to investigators.

## 10. REST API (Express)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/sahyog/intake` | Mock SAHYOG case intake |
| GET/POST | `/api/cases`, `/api/cases/:id` | List/create/get case |
| POST | `/api/cases/:id/trace` | Start trace (params in body) |
| GET | `/api/traces/:id` | Status, progress, summary |
| GET | `/api/traces/:id/graph` | Nodes + edges |
| GET | `/api/traces/:id/candidates` | Candidates with confidence |
| GET | `/api/traces/:id/evidence` | Path and identity evidence |
| POST | `/api/traces/:id/rerun` | Re-run (`mode=snapshot|fresh`) |
| POST | `/api/candidates/:id/review` | Confirm / reject + note |
| GET | `/api/traces/:id/report?format=pdf|json` | Export report |
| POST | `/api/cases/:id/sahyog-request` | Create request (confirmed only) |
| POST | `/api/sahyog/route` | Mock routing endpoint |
| POST | `/api/sahyog/requests/:id/simulate` | Advance mock VASP response |
| CRUD | `/api/admin/vasp`, `/mixers`, `/bridges` | Reference data |
| POST | `/api/admin/validation/run` | Run validation |
| GET | `/api/audit` | Audit log |
| GET/POST | `/api/settings/demo-mode` | Toggle Demo Mode |

## 11. Frontend (React + Vite)

**Libraries:** React Router, TanStack Query, Tailwind CSS, `@supabase/supabase-js` (auth), **React Flow** (or Cytoscape.js) for the graph, Recharts for validation charts, `react-hook-form` + `zod`.

**Screens**
1. Login
2. Dashboard: KPIs (cases, traced, confirmed, NONE rate), recent cases
3. New Case / Simulate SAHYOG intake
4. Case Detail (graph, candidates, evidence, risk, alerts, review, report, SAHYOG tab)
5. SAHYOG Requests (status timeline)
6. VASP Database (admin)
7. Validation (admin)
8. Audit Log (admin)

**UI rules:** confidence badges HIGH/MEDIUM/LOW/NONE; the words "Candidate" never "Owner"; persistent footer disclaimer; a visible "AI suggests · Evidence decides · Human confirms" strip on the case page.

## 12. Suggested Repository Structure

```
/client            React app (Vite)
  /src/pages /components /hooks /lib
/server            Express app
  /src
    /routes /controllers /middleware
    /providers   etherscan.js tron.js bitcoin.js mockIntel.js
    /engine      tracer.js detectors.js evidence.js scoring.js decision.js
    /services    report.js sahyog.js audit.js cache.js
    /fixtures    demo cases (eth, tron, btc, mixer, no-vasp)
    /tests
/supabase          migrations/*.sql, seed.sql
```

## 13. Demo Cases (built as fixtures so the demo never fails)

1. **HIGH:** ETH wallet → 3 hops → known exchange hot wallet, with two independent identity sources.
2. **MEDIUM:** Tron USDT trace with one identity source.
3. **LOW:** path with an amount/timing-only hop and conflicting labels.
4. **NONE (mixer):** path ends at a mixer contract, shows "No Reliable VASP Found" + checked list.
5. **Bitcoin clustering demo:** address clustered by common-input heuristic to a cluster containing a known exchange address; CoinJoin transaction correctly excluded.
6. **Bridge flag:** a path hitting a bridge contract, showing weak link handling.

## 14. Acceptance Criteria

- [ ] A user can log in, create a case (or simulate a SAHYOG intake), and start a trace for ETH, Tron and BTC.
- [ ] The graph renders with hop depth, share of funds, and flagged mixer/bridge nodes.
- [ ] Decision engine returns exactly the confidence defined in Section 5 FR-6 for all unit-test scenarios (at least 12 test cases covering every branch).
- [ ] Path and identity evidence are shown separately with source + timestamp for each item.
- [ ] Mixer path shows the alert, lowered confidence, and "No Reliable VASP Found" with a checked-items list.
- [ ] Dust transfers do not appear in candidate ranking.
- [ ] Investigator can confirm/reject; SAHYOG request is blocked until a candidate is confirmed.
- [ ] PDF and JSON reports export correctly.
- [ ] Mock SAHYOG lifecycle (Sent → Acknowledged → Action taken) is visible.
- [ ] Validation page reports recovery rate and false-positive count.
- [ ] Audit log lists every external call with timestamp; a trace can be re-run from snapshot with identical results.
- [ ] Only addresses/tx hashes appear in outbound API calls (unit-tested `sanitize()`).
- [ ] Demo Mode works with the network disabled.
- [ ] App is deployed and reachable from a public URL.

## 15. Build Plan (adjust to your deadline)

| Phase | Deliverable |
|---|---|
| Day 1 | Supabase project, schema + RLS, seed reference data, Express skeleton, auth, React shell |
| Day 2 | Provider adapters (ETH, Tron, BTC), caching, tracing engine, graph storage |
| Day 3 | Detectors (mixer, CoinJoin, bridge), evidence extraction, decision engine + tests |
| Day 4 | Scoring (classifier + risk), candidate ranking, case detail UI with graph and evidence |
| Day 5 | Review flow, report export, mock SAHYOG, admin pages, audit log |
| Day 6 | Validation module, demo fixtures, Demo Mode, polish, deployment, PPT link |

**Priority if time is short:** decision engine + evidence separation + graph + report + mixer/NONE handling come first. Bitcoin clustering, validation page, and BNB/Polygon come last.

## 16. Deployment (for the PPT URL)

- **Frontend:** Vercel or Netlify (Vite build). This is the URL you put in the PPT.
- **Backend:** Render / Railway / Fly.io (Node service). Note: free tiers may sleep; open the app before the presentation or add a health-check ping.
- **Database/Auth:** Supabase hosted project.
- **Env vars**
  - Client: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - Server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ETHERSCAN_API_KEY`, `TRONGRID_API_KEY`, `CORS_ORIGIN`, `DEMO_MODE_DEFAULT`
- Create a **judge demo account** (read+trace access) and put credentials on the last slide or in a README; keep Demo Mode ON by default.

## 17. Risks and Mitigations (from slide 4, made concrete)

| Risk | Mitigation in prototype |
|---|---|
| Mixers / CoinJoin | Detect, flag path, lower confidence, exclude from clustering |
| Shared exchange wallets | Always "candidate", never ownership; disclaimer in UI and report |
| False positives | Require multiple independent evidence sources for HIGH; validation page reports FP count |
| Commercial API access | Modular intelligence adapter + mock provider |
| SAHYOG API details unknown | Mock interface behind a swappable client |
| Free API rate limits | Caching, fixtures, Demo Mode |
| Label accuracy of seed data | Store source URL per label; admin review; never invent addresses |

## 18. Suggested Demo Script (3 minutes)

1. Simulate SAHYOG intake → case appears.
2. Run trace on the HIGH fixture → graph builds → candidate with two sources → explain path vs identity.
3. Open the mixer case → alert + "No Reliable VASP Found" + what was checked.
4. Confirm a candidate as investigator → generate report → send to mock SAHYOG → advance status.
5. Show the Validation page (recovery rate, false positives) and the audit log.

## 19. Open Questions to Settle Early

1. Which exact public sources will you use to seed exchange addresses (and how many per chain)?
2. Will you fit the classifier weights on a small labeled set, or ship transparent hand-set weights and say so on the slide?
3. Is a live BTC/ETH/Tron trace required in the live demo, or is Demo Mode with one live "bonus" trace enough?
