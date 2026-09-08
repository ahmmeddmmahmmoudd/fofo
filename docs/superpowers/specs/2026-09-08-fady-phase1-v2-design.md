# fady — Phase 1 v2 Design: Multi-Vertical Core Platform + Booking Policy Engine

## Context

This spec **supersedes** `2026-09-08-fofo-phase1-design.md`. The product is
rebranded from "fofo" to **fady**, and — per a scope decision made mid-build
— now targets two business verticals from day one instead of one:

1. **Gaming lounges** (PlayStation cafes) — book a *room* by the hour.
2. **Restaurants / cafés** — book a *table* for a party, with a food/drink
   deposit.

Both verticals share one booking engine (units, bookings, cancellation
policy, reliability tracking) with vertical-specific fields and policy
defaults. This keeps Phase 1 a single coherent build instead of two
divergent products.

**What stays exactly as before (from the original spec):** multi-tenant
SaaS, real backend + database, Arabic/English UI with RTL, staff-facing
dashboard only in this phase (still no public customer booking page —
that's Phase 2), revenue computed automatically, project tech stack
(Node.js + Express + `node:sqlite` — see the node:sqlite amendment already
recorded in the Phase 1 implementation plan's ledger).

**What's new in this revision**, captured from the business rules
described by the user:

### Cancellation / no-show / reliability policy (both verticals)

- Every business sets a **grace window**: how long after a booking's
  scheduled start time a no-show customer has before the booking
  auto-cancels. Gaming lounges: a wide range, 15 minutes to 3 hours,
  owner-configurable. Restaurants: a short window, ~30 minutes — food
  prep starts ahead of the reservation and spoils if left waiting.
- **Customer self-cancels before the auto-cancel deadline** → no penalty
  to the customer, and the business is notified immediately so the
  unit can be freed for a walk-in. This is the "clean cancellation" path.
- **Customer never shows, booking auto-cancels** → counts against that
  customer's reliability record at this business (a no-show).
- **Customer shows up on time, but the business has no unit available
  despite the reservation** → counts against the *business's*
  reliability record (an overbooking incident) — protects the meaning
  of a reservation from the customer's side of the trust relationship.
- **Refund cutoff** (when a deposit is involved — restaurants; optional
  for gaming): the point before the scheduled start after which a
  cancellation no longer qualifies for a refund. This is *earlier*
  (further from the booking time) for restaurants than for gaming,
  because kitchen prep commits real cost ahead of the reservation slot;
  gaming has no prep cost, so its cutoff can sit close to the start
  time. Actual deposit *collection* (charging a card) is Phase 3 —
  Phase 1 stores and enforces the cutoff as a policy/state machine only.

## Out of scope (future phases — unchanged in kind, revised in shape)

- Public customer booking page + QR-code check-in flow (Phase 2) — the
  data model below is built so Phase 2 can plug into it without a
  schema rewrite (bookings can already have a future `scheduled_start`,
  not just an immediate walk-in start).
- Real deposit collection via a payment gateway, e.g. Paymob (Phase 3).
  Phase 1 tracks *whether* a deposit is required and its amount/cutoff,
  but does not charge anyone.
- Subscription billing for business owners to use fady itself.
- Multi-staff roles/permissions within one business.
- Cross-business customer identity (a phone number's reliability score
  is tracked per-business in Phase 1, not as one global profile across
  every fady business — that's a real product decision with privacy
  implications, deferred).

## Architecture

Unchanged from the original spec except naming: Node.js + Express,
`node:sqlite` (`DatabaseSync`, built into Node — no native compile
step), plain HTML/CSS/JS frontend, `express-session` with a custom
SQLite-backed store, `bcryptjs` for password hashing, Arabic default +
RTL with an English toggle. Project name is **fady** everywhere (package
name, README, page titles, UI strings, GitHub repo — repo rename
pending explicit action, see below).

## Data model

```
businesses
  id                        INTEGER PK
  name                      TEXT NOT NULL
  email                     TEXT UNIQUE NOT NULL
  password_hash             TEXT NOT NULL
  business_type             TEXT NOT NULL   -- 'gaming' | 'restaurant'
  grace_window_minutes      INTEGER NOT NULL DEFAULT 60   -- gaming: 15-180; restaurant: default 30
  deposit_required          INTEGER NOT NULL DEFAULT 0    -- boolean 0/1; restaurants typically 1
  deposit_amount            REAL              -- flat amount or NULL if not required
  refund_cutoff_minutes     INTEGER           -- minutes before scheduled_start; NULL = no deposit/refund policy
  reliability_score         REAL NOT NULL DEFAULT 100     -- business-side, decremented by overbooking_incidents
  created_at                TEXT NOT NULL

units                                          -- generalizes "rooms" (gaming) and "tables" (restaurant)
  id                        INTEGER PK
  business_id               INTEGER NOT NULL REFERENCES businesses(id)
  name                      TEXT NOT NULL      -- "Room 1" | "Table 4"
  status                    TEXT NOT NULL DEFAULT 'empty'  -- 'empty' | 'busy'
  created_at                TEXT NOT NULL
  -- gaming-only (NULL for restaurant units):
  ps_type                   TEXT              -- 'PS4' | 'PS5'
  hourly_rate               REAL
  -- restaurant-only (NULL for gaming units):
  capacity                  INTEGER           -- seats

bookings                                       -- generalizes "play_sessions"; covers both walk-ins and future reservations
  id                        INTEGER PK
  unit_id                   INTEGER NOT NULL REFERENCES units(id)
  business_id               INTEGER NOT NULL REFERENCES businesses(id)  -- denormalized for CRM/reliability queries
  client_name               TEXT NOT NULL
  client_phone              TEXT NOT NULL
  status                    TEXT NOT NULL     -- 'active' | 'completed' | 'cancelled' | 'no_show'
  scheduled_start           TEXT NOT NULL     -- ISO timestamp; "now" for an immediate walk-in, future for a reservation
  grace_window_minutes      INTEGER NOT NULL  -- copied from business policy at booking time (policy can change later without altering past bookings)
  auto_cancel_at            TEXT NOT NULL     -- scheduled_start + grace_window_minutes
  started_at                TEXT              -- set when the unit actually goes busy (walk-in: same as scheduled_start)
  ended_at                  TEXT              -- set when the booking completes
  cancelled_at              TEXT
  cancelled_by              TEXT              -- 'customer' | 'system' | 'business'
  revenue                   REAL              -- gaming: hours * hourly_rate; restaurant: deposit or NULL in Phase 1
  deposit_amount            REAL              -- copied from business policy at booking time, if required
  created_at                TEXT NOT NULL

overbooking_incidents                          -- customer showed up, reservation existed, no unit was actually free
  id                        INTEGER PK
  business_id               INTEGER NOT NULL REFERENCES businesses(id)
  booking_id                INTEGER NOT NULL REFERENCES bookings(id)
  logged_at                 TEXT NOT NULL
  note                      TEXT              -- optional staff note

sessions_store                                 -- unchanged: express-session backing store
  sid                       TEXT PRIMARY KEY
  data                      TEXT NOT NULL
  expires                   INTEGER NOT NULL
```

All queries scoped by `business_id` from the logged-in session, exactly
as before — no cross-tenant visibility.

**Why `units` instead of separate `rooms`/`tables` tables:** both are
"a bookable thing with a name and a status," and every booking-lifecycle
query (occupancy, revenue, CRM, reliability) is identical regardless of
vertical. Vertical-specific columns are nullable rather than split into
subtype tables — simpler joins, and Phase 1 has few enough columns that
a subtype-table split would be premature normalization.

## Core flows

1. **Signup** — business name, email, password, **business type**
   (gaming or restaurant) → creates a `businesses` row with sensible
   policy defaults for that type (gaming: `grace_window_minutes=60`,
   `deposit_required=0`; restaurant: `grace_window_minutes=30`,
   `deposit_required=1`, owner sets `deposit_amount` and
   `refund_cutoff_minutes` during onboarding or from settings).
2. **Login / logout** — unchanged.
3. **Unit management** — add/edit/remove a unit. Form fields adapt to
   `business_type`: gaming shows PS type + hourly rate; restaurant
   shows capacity (no hourly rate — restaurant revenue in Phase 1 is
   deposit-based, not time-based).
4. **Booking creation (staff-initiated in Phase 1 — no customer
   self-booking yet, that's Phase 2)** — staff picks a unit, enters
   client name/phone, and either "start now" (walk-in,
   `scheduled_start = now`) or picks a future time (reservation). The
   business's current `grace_window_minutes` and, if applicable,
   `deposit_amount` are copied onto the booking. `auto_cancel_at` is
   computed and stored.
5. **Occupancy toggle / booking lifecycle** —
   - A background sweep (checked on every dashboard load / API poll,
     no separate cron process needed for Phase 1's scale) finds
     `active` bookings past `auto_cancel_at` with the unit still not
     marked busy by staff, and flips them to `status='no_show'`,
     frees the unit, and this counts against the client's reliability
     at this business.
   - Staff can **end** a booking (customer leaves) → `status='completed'`,
     `ended_at` set, revenue computed (gaming: hours × rate; restaurant:
     the deposit amount, until Phase 3 adds real order totals).
   - Staff or the (future, Phase 2) customer can **cancel** before
     `auto_cancel_at` → `status='cancelled'`, `cancelled_by` recorded.
     No reliability penalty if cancelled before the deadline.
   - Staff can **log an overbooking incident** when a customer with a
     valid reservation arrives and no unit is actually free — creates
     an `overbooking_incidents` row and decrements the business's
     `reliability_score`.
6. **CRM / clients view** — per business, aggregated from `bookings`:
   name, phone, visit count (`completed`), total spent, last visit,
   plus a **reliability indicator** (no-show count / late-cancel count
   at this business).
7. **Revenue dashboard** — unchanged shape (today/week/month +
   per-unit breakdown), summed from `bookings.revenue` where
   `status='completed'`.

## Error handling

Same pattern as the original spec (400 validation, 401 unauth, 404
cross-tenant/not-found, 409 conflicting-state), plus:
- Creating a unit with vertical-mismatched fields (e.g. `ps_type` on a
  restaurant business) returns 400.
- Cancelling or completing a booking that's already
  `completed`/`cancelled`/`no_show` returns 409.
- Logging an overbooking incident on a booking that isn't currently
  `active` and past its `scheduled_start` returns 409 (an incident
  only makes sense for a reservation the customer is actually honoring
  on time).

## Testing

Same approach as the original spec (Node's built-in `node:test` against
a temp SQLite file), extended to cover: business-type-conditional
validation, the auto-cancel sweep (a booking whose `auto_cancel_at` is
in the past transitions to `no_show` and frees its unit), clean
cancellation before the deadline (no penalty), and overbooking-incident
logging decrementing `reliability_score`.

## Language / RTL

Unchanged. `i18n.js` gains vertical-aware labels (e.g. "Room" vs
"Table", "PS Type" vs "Capacity") selected by `business_type`.

## Migration note (for the in-progress build)

Tasks 1 (scaffold) and 3 (password hashing) of the original
implementation plan are unaffected by this revision and stand as-is.
Task 2 (schema) implemented the *old* single-vertical schema
(`rooms`/`play_sessions`) and must be redone against the schema above
before any further task proceeds. This is recorded as a plan amendment
in the Phase 1 implementation plan and its SDD ledger, not a new
implementation plan — the task numbering and remaining task shapes
(auth routes, unit routes, booking routes, CRM routes, frontend) stay
structurally the same, just rebranded and widened for two verticals.
