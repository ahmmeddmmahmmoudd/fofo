# fady — Engineering Handover

**Repo:** `github.com/ahmmeddmmahmmoudd/fofo` (rename to `fady` pending —
requested, not yet done; no `gh` CLI/token available in the build
environment to do it automatically).
**Branch with all work below:** `phase1-core-platform` (not yet merged to
`master` — merges once the full Phase 1 task list is done and reviewed).
**Companion doc:** `BRAINSTORMING.md` — full product vision, including
design/architecture direction not yet implemented.

> **Read this before trusting any status claim elsewhere:** the sections
> below are cross-checked against `git log` on this branch as of this
> handover. Where a module lists something as "pending," it is not present
> in the codebase — full stop, not "mostly there."

---

## 1. Project Modules Breakdown

### Module A — Auth & User Profile
Business-owner signup/login/logout, session management, per-business
policy configuration (grace window, deposit requirement/amount, refund
cutoff), venue-side reliability tracking.
*Customer-side* auth/profile (a customer account with a cross-venue
Reliability Score and a wallet) is a distinct, larger piece — see Gap
Analysis below; the current build only has business-owner accounts.

### Module B — Venue & Resource Inventory Engine
Real-time unit (room/table) inventory per business: name, status
(empty/busy), vertical-specific fields (PS type + hourly rate for gaming;
capacity for restaurant). Walk-in override is implicit — staff can mark a
unit busy directly without a prior reservation.

### Module C — Booking & Dynamic QR Engine
Time-sensitive reservation states (reserved → active → completed /
cancelled / no_show), grace-window auto-cancellation, and — per the
proposed direction in `BRAINSTORMING.md` — a dynamic QR boarding pass and
Redis-backed expiry queue for the grace-window timer instead of a
poll-on-load sweep.

### Module D — F&B Deposit & Payment Gateway Integration
Deposit hold, capture on completion, refund on a qualifying cancellation,
and the `In-Preparation` kitchen-status lock that makes a deposit
non-refundable regardless of timing.

### Module E — Merchant Terminal CRM
Tablet-optimized live grid for staff (the "Live Radar View" from
`BRAINSTORMING.md`), single-tap QR verification at check-in, client
history/reliability lookup.

---

## 2. Current Status & Gap Analysis

### What has been architected AND implemented (in the repo, on `phase1-core-platform`, tests passing)

| Piece | Where | Commit |
|---|---|---|
| Node.js + Express app scaffold, `/health` endpoint | `src/app.js`, `server.js` | `75edcb6` |
| SQLite via Node's built-in `node:sqlite` (no native compile dependency — see Justification Log) | `src/db.js` | `6e6fde2` |
| Full multi-vertical schema: `businesses` (+ `business_type`, `grace_window_minutes`, `deposit_required`, `deposit_amount`, `refund_cutoff_minutes`, `reliability_score`), `units`, `bookings` (+ status/`scheduled_start`/`auto_cancel_at`/`cancelled_by` columns), `overbooking_incidents`, `sessions_store` | `src/db.js` | `7162583`, `7d97aaf` |
| Password hashing (bcrypt via `bcryptjs`) | `src/authUtils.js` | `0584bd6` |
| Custom SQLite-backed `express-session` store (sessions survive server restart) | `src/sessionStore.js` | `e488ea0` |
| Signup/login/logout/me with `business_type` validation and vertical policy defaults (gaming: 60 min grace, no deposit; restaurant: 30 min grace, deposit required, defaults overridable) | `src/routes/auth.js`, `src/middleware/requireAuth.js` | `dd4edc3` |

**23/23 tests passing** as of `dd4edc3` (`npm test`, Node's built-in
`node:test` runner).

### What has been architected (design docs) but NOT implemented

- Units CRUD routes (Module B's API surface) — schema exists, no
  `src/routes/units.js` yet.
- Bookings lifecycle routes: start/end/cancel/no-show, the auto-cancel
  sweep, overbooking-incident logging (Module C's API surface) — schema
  exists, no `src/routes/bookings.js` yet.
- CRM routes: client aggregation, reliability display, revenue summary
  (Module E's data layer) — no `src/routes/crm.js` yet.
- Frontend: login/signup page, dashboard (unit grid, booking toggle,
  revenue/CRM view) — no `public/` files yet.
- Cancellation/refund policy documented precisely in `BRAINSTORMING.md`
  §3 (5-10 min / 2-hour F&B cancellation window, `In-Preparation` lock,
  -20 Reliability Score on no-show, sub-60-score mandatory deposit gate)
  is **not yet reflected in code** — the current `bookings` schema has
  the *columns* needed (`cancelled_at`, `cancelled_by`, `deposit_amount`)
  but none of this specific policy math is implemented in a route yet.

### What is pending and NOT YET architected in the data model at all

- **Redis-backed expiry queues.** The current auto-cancel design (per the
  existing implementation plan) is a poll-on-load sweep checked whenever
  the dashboard fetches data — adequate for a single small venue's staff
  dashboard, but not a real TTL/expiry worker. Adopting Redis is a real
  infrastructure decision, not just a code change — see Justification Log.
- **Dynamic QR boarding passes.** No QR generation/scanning exists
  anywhere in the codebase. Needs a QR library, a scan-capable staff UI
  (Module E), and a decision on what payload the QR encodes (a signed
  booking ID token, most likely).
- **Wallet system.** No `wallet` table, no balance/ledger model, no
  customer-facing account at all yet (see Module A note above — customer
  identity in the current model is just `client_name`/`client_phone`
  strings on a booking, not an account).
- **Payment gateway integration (deposit capture/refund/webhooks).**
  Explicitly out of scope for the current phase per the original spec
  (`docs/superpowers/specs/2026-09-08-fady-phase1-v2-design.md`) — the
  schema tracks deposit *policy* (amount, requirement, cutoff) but never
  charges anyone. No gateway account, no webhook endpoint, nothing.
- **Geolocation-mismatch overbooking trigger.** No location data is
  captured anywhere in the current model — this needs a real product
  decision on what's captured (customer device location? staff terminal
  location?), a privacy/consent story, and an accuracy-threshold policy
  before it's a schema question at all.
- **Prisma / formal SQL migration tooling.** The current schema is
  hand-written `CREATE TABLE IF NOT EXISTS` in `src/db.js` — adequate for
  SQLite at this scale, but if the project moves to Postgres (likely,
  once Redis and a payment gateway are in the picture — SQLite's
  single-writer model gets uncomfortable with a queue worker touching the
  same data), a real migration tool (Prisma, or plain `node-pg-migrate`)
  should replace this before it does.

### Justification Log

- **`node:sqlite` over `better-sqlite3` or Prisma+Postgres:** the original
  build hit a real wall — `better-sqlite3` requires native compilation,
  which failed on the dev machine (no Visual Studio Build Tools) and would
  likely fail identically on many hosting providers without a C++
  toolchain. The person running this project has no prior technical/dev
  background and no domain — minimizing infrastructure surface area was a
  deliberate, explicit tradeoff favoring "it just works" over
  "production-grade from day one." **This directly conflicts with
  adopting Redis** (Module C's proposed TTL worker) and eventually
  Postgres: both need a *hosted service*, not just a library. If Redis is
  adopted, recommend **Upstash** (serverless Redis over a REST API, real
  free tier, no server to manage) over self-hosting, to preserve the
  "no infrastructure to babysit" property that drove the `node:sqlite`
  choice in the first place. This is a decision for the project owner,
  not one to make silently in code.
- **Multi-vertical schema via nullable columns, not subtype tables:**
  `units` and `bookings` share one table each across gaming/restaurant
  with vertical-specific columns left nullable, rather than
  `gaming_units`/`restaurant_units`. Every booking-lifecycle query
  (occupancy, revenue, CRM) is identical regardless of vertical; splitting
  would mean duplicating that logic per vertical for no benefit at this
  column count.
- **Business-scoped Reliability Score, not global:** deferred a
  cross-venue customer identity system (real privacy/product implications)
  in favor of shipping a working single-venue-scoped version first. See
  Open Question in `BRAINSTORMING.md` §4.
- **Plain HTML/CSS/JS frontend, no framework:** no build step needed,
  which matters again for a non-technical owner who needs to be able to
  understand and redeploy the project without an npm build pipeline.
  The proposed "dark OLED / Live Radar" redesign in `BRAINSTORMING.md`
  does not require abandoning this — a live-updating dark dashboard is
  achievable in plain JS with periodic polling or (later) a WebSocket,
  without pulling in React/etc.

---

## 3. Testing Suite & Verification Matrix

> **Status: these are acceptance-criteria test specifications for
> Modules C and D's *proposed* behavior (Redis expiry, F&B refund lock,
> geolocation-triggered overbooking penalty) — none of this is runnable
> today.** The current codebase's actual tests are Node's built-in
> `node:test` runner (23 passing tests across Tasks 1-5, see
> `tests/*.test.js`), not Jest. The specs below are written in Jest syntax
> per the request, as a target for whoever implements Modules C/D — they
> are not wired into `npm test` and will not run until that
> implementation exists. Treat this section as a spec, not evidence.

### 3.1 Unit & Edge-Case Tests (Jest syntax, target for Module C/D implementation)

```js
// __tests__/booking-expiry.test.js
// Target: Module C — Redis-backed grace-window expiry
describe('Booking auto-cancellation via grace-window expiry', () => {
  test('a booking auto-cancels when its Redis TTL key expires past the grace period', async () => {
    // Arrange: create a booking with scheduled_start = now, grace_window = 20 min
    const booking = await createBooking({ scheduledStart: Date.now(), graceWindowMinutes: 20 });
    // The expiry worker sets a Redis key `booking:expiry:<id>` with TTL = graceWindowMinutes * 60
    expect(await redisTtl(`booking:expiry:${booking.id}`)).toBeGreaterThan(0);

    // Act: simulate the TTL elapsing (Redis keyspace-notification fires, or the worker polls and finds it expired)
    await advanceRedisTtl(`booking:expiry:${booking.id}`, { expire: true });
    await runExpiryWorkerOnce();

    // Assert
    const updated = await getBooking(booking.id);
    expect(updated.status).toBe('no_show');
    expect(updated.unit.status).toBe('empty'); // unit freed for a walk-in
  });

  test('the expiry key is removed if the booking completes before the grace deadline', async () => {
    const booking = await createBooking({ scheduledStart: Date.now(), graceWindowMinutes: 20 });
    await checkInBooking(booking.id); // customer scans QR pass, staff confirms
    expect(await redisExists(`booking:expiry:${booking.id}`)).toBe(false);
  });
});

// Target: Module A/C — voluntary cancellation must never touch Reliability Score
describe('Voluntary customer cancellation before the grace deadline', () => {
  test('cancelling before auto-cancel incurs zero Reliability Score penalty', async () => {
    const booking = await createBooking({ scheduledStart: Date.now() + 10 * 60000, graceWindowMinutes: 20 });
    const before = await getReliabilityScore(booking.customerId);

    await cancelBooking(booking.id, { cancelledBy: 'customer' });

    const after = await getReliabilityScore(booking.customerId);
    expect(after).toBe(before); // no change
    const updated = await getBooking(booking.id);
    expect(updated.status).toBe('cancelled');
    expect(updated.cancelledBy).toBe('customer');
  });

  test('the venue is notified immediately so the unit can be offered to a walk-in', async () => {
    const booking = await createBooking({ scheduledStart: Date.now() + 10 * 60000, graceWindowMinutes: 20 });
    const notifySpy = jest.spyOn(venueNotifier, 'unitFreed');

    await cancelBooking(booking.id, { cancelledBy: 'customer' });

    expect(notifySpy).toHaveBeenCalledWith(booking.unitId);
  });
});

// Target: Module D — F&B deposit refund lock
describe('F&B deposit refund window and In-Preparation lock', () => {
  test('cancelling within 10 minutes of booking creation refunds the deposit', async () => {
    const booking = await createFnbBooking({ depositAmount: 50 });
    // no time advance — cancel immediately
    const result = await cancelBooking(booking.id, { cancelledBy: 'customer' });
    expect(result.refund.amount).toBe(50);
  });

  test('cancelling more than 10 minutes after booking but more than 2 hours before arrival still refunds', async () => {
    const booking = await createFnbBooking({
      depositAmount: 50,
      arrivalTime: Date.now() + 5 * 3600000 // 5 hours out
    });
    await advanceTime(15 * 60000); // 15 minutes after booking creation
    const result = await cancelBooking(booking.id, { cancelledBy: 'customer' });
    expect(result.refund.amount).toBe(50);
  });

  test('cancelling once kitchen status is In-Preparation never refunds, regardless of timing', async () => {
    const booking = await createFnbBooking({ depositAmount: 50 });
    await setKitchenStatus(booking.id, 'In-Preparation');
    const result = await cancelBooking(booking.id, { cancelledBy: 'customer' });
    expect(result.refund.amount).toBe(0);
    expect(result.refund.reason).toBe('kitchen_in_preparation');
  });
});

// Target: Module B/C — venue overbooking penalty via geolocation mismatch
describe('Venue overbooking penalty', () => {
  test('a booking flagged with a geolocation mismatch at check-in queues for staff review, not an automatic penalty', async () => {
    const booking = await createBooking({ scheduledStart: Date.now() });
    const checkIn = await checkInBooking(booking.id, {
      customerLocation: FAR_FROM_VENUE_COORDS
    });
    expect(checkIn.flaggedForReview).toBe(true);
    expect(checkIn.overbookingPenaltyApplied).toBe(false); // mismatch alone never auto-penalizes the venue
  });

  test('staff confirming a genuine overbooking incident applies the venue penalty and a customer wallet refund', async () => {
    const booking = await createBooking({ scheduledStart: Date.now() });
    const before = await getVenueReliabilityScore(booking.businessId);

    await logOverbookingIncident(booking.id, { confirmedByStaff: true });

    const after = await getVenueReliabilityScore(booking.businessId);
    expect(after).toBeLessThan(before);
    const wallet = await getCustomerWallet(booking.customerId);
    expect(wallet.balance).toBeGreaterThan(0);
  });
});
```

### 3.2 What's actually runnable today

```bash
cd "path/to/fofo-phase1-core-platform"
npm test
```
Runs the real `node:test` suite (23 tests as of `dd4edc3`) covering
Tasks 1-5: health check, schema creation, password hashing, session
store, and auth routes (signup/login/logout/me + business_type policy
defaults). This is the actual, current verification surface — the Jest
specs above are a target, not a parallel suite.

### 3.3 Runbook (current state — no Redis/Postgres yet)

```bash
# 1. Clone and enter the project
cd "D:\Ai Agents\Claude\Artifacts\fofo-phase1-core-platform"

# 2. Install dependencies (Node >= 24.0.0 required — see package.json "engines")
npm install

# 3. Run the real test suite
npm test

# 4. Boot the dev server
npm start
# -> fady server listening on port 3000 (no routes to hit yet beyond /health and /api/auth/*
#    until Tasks 6-11 land)
```

### 3.4 Runbook (once Redis/Postgres are adopted — not yet true, documented for planning)

```bash
# Local Redis (only needed once Module C's TTL worker is built)
docker run -p 6379:6379 redis:7

# Or, per the Justification Log's recommendation, skip local Redis
# entirely and use an Upstash free-tier instance via its REST API —
# no local service to run at all.

# Postgres (only needed if/when the project outgrows SQLite)
docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16

# Seed + migrate (tooling choice — Prisma or node-pg-migrate — not yet made)
npx prisma migrate dev   # placeholder command, pending the tooling decision above
npx prisma db seed       # placeholder command
```
