# fofo — Phase 1 Design: Core Platform (Staff Dashboard + CRM)

## Context

fofo is a booking + CRM platform for PlayStation lounge/cafe business
owners in Egypt. The full product will eventually include a public
customer-facing booking page and online deposit payments, but those
are separate, later phases. This spec covers **Phase 1 only**: a
multi-tenant staff dashboard that lets a business owner manage their
own rooms, track occupancy, and see revenue/client CRM data.

Decisions already made with the user:
- Multi-tenant SaaS: many independent PlayStation businesses, each
  with their own account and data, fully isolated from each other.
- Real backend + database (not a browser-only prototype).
- Arabic + English UI, Arabic default, RTL layout when Arabic active.
- Staff-facing dashboard only in this phase — no public booking page,
  no online payments (those are Phase 2 and Phase 3).
- Rooms track: name, PS type (PS4/PS5), hourly rate, status.
- Revenue is computed automatically per completed session
  (duration × hourly rate), not manually entered.

## Out of scope (future phases)

- Public customer booking page (Phase 2).
- Online deposit payments via a gateway such as Paymob (Phase 3).
- Subscription billing for business owners to use fofo itself.
- Multi-staff roles/permissions within one business (Phase 1 has a
  single login per business; anyone with the credentials has full
  access to that business's data).

## Architecture

- **Runtime**: Node.js + Express, serving both the JSON API and the
  static frontend from the same server. No frontend build step.
- **Database**: SQLite via `better-sqlite3`, single file
  (`data/fofo.db`), synchronous API keeps route handlers simple.
- **Frontend**: Plain HTML/CSS/JS, fetch-based calls to the API. A
  small `i18n.js` dictionary drives the ar/en toggle and RTL/LTR
  switching.
- **Auth**: Session-based, signed HTTP-only cookies
  (`express-session` + a SQLite session store so sessions survive
  server restarts). Passwords hashed with `bcrypt`.
- **Project location**: `D:\Ai Agents\Claude\Artifacts\fofo\`.

## Data model

```
businesses
  id            INTEGER PK
  name          TEXT NOT NULL
  email         TEXT UNIQUE NOT NULL
  password_hash TEXT NOT NULL
  created_at    TEXT NOT NULL

rooms
  id            INTEGER PK
  business_id   INTEGER NOT NULL REFERENCES businesses(id)
  name          TEXT NOT NULL         -- e.g. "Room 1"
  ps_type       TEXT NOT NULL         -- 'PS4' | 'PS5'
  hourly_rate   REAL NOT NULL
  status        TEXT NOT NULL DEFAULT 'empty'  -- 'empty' | 'busy'
  created_at    TEXT NOT NULL

play_sessions
  id            INTEGER PK
  room_id       INTEGER NOT NULL REFERENCES rooms(id)
  business_id   INTEGER NOT NULL REFERENCES businesses(id)  -- denormalized for fast CRM queries
  client_name   TEXT NOT NULL
  client_phone  TEXT NOT NULL
  started_at    TEXT NOT NULL
  ended_at      TEXT                  -- NULL while session is active
  revenue       REAL                  -- computed when ended
```

All queries are scoped by `business_id` taken from the logged-in
session — a business can never see another business's rooms, clients,
or sessions.

## Core flows

1. **Signup** — business name, email, password → creates a
   `businesses` row, password hashed, auto-logs-in, redirects to
   dashboard.
2. **Login / logout** — email + password against `businesses`;
   logout destroys the session.
3. **Room management** — from the dashboard, owner can add a room
   (name, PS type, hourly rate), edit its rate/name/type, or delete
   it (only allowed when no active session on that room).
4. **Occupancy toggle** —
   - Room card shows current status (Empty/Busy).
   - **Mark Busy**: opens a small inline form for client name +
     phone → creates a `play_sessions` row with `started_at = now`,
     sets room status to `busy`.
   - **Mark Empty**: closes the active session (`ended_at = now`),
     computes `revenue = hours_elapsed * hourly_rate` (rounded to 2
     decimals, minimum billed as actual elapsed minutes/60), sets
     room status back to `empty`.
5. **CRM / clients view** — table aggregated from `play_sessions`
   grouped by `client_phone`: name, phone, visit count, total spent,
   last visit date.
6. **Revenue dashboard** — summary cards: today / this week / this
   month totals (sum of `revenue` where `ended_at` falls in range),
   plus a per-room breakdown table.

## Error handling

- All API routes validate input server-side (required fields, rate
  must be > 0, phone/name non-empty) and return
  `{ error: "message" }` with a 4xx status; frontend shows the
  message inline near the form.
- Auth middleware protects every `/api/*` route except
  `/api/auth/login` and `/api/auth/signup`; unauthenticated requests
  get 401.
- Attempting to delete a room with an active session returns 409
  with a clear message ("End the active session first").
- Attempting to mark an already-busy room busy again (race/double
  click) is rejected with 409, not silently overwritten.

## Testing

- API-level tests using Node's built-in `node:test` + `assert`,
  running against a temporary SQLite file created/torn down per test
  run. Cover: signup/login, room CRUD + business isolation (business
  A cannot see/edit business B's rooms), session start → end revenue
  calculation, double-toggle rejection.
- Manual browser walkthrough of the full dashboard flow (signup →
  add room → toggle busy → toggle empty → check CRM/revenue numbers)
  before considering Phase 1 done.

## Language / RTL

- `i18n.js` holds `ar` and `en` string dictionaries keyed by the same
  identifiers; a toggle in the header swaps the active language and
  sets `dir="rtl"`/`dir="ltr"` on `<html>` plus a matching CSS
  stylesheet swap for mirrored layout. Arabic is the default on first
  load; the choice persists in `localStorage`.
