# fady — Brainstorming & Product Vision

> **Status note:** this document consolidates *all* product thinking discussed
> for fady, including a newer, more ambitious architecture direction
> (real-time radar UI, Redis-backed expiry, wallet, dynamic QR passes) that
> is **not yet built**. See `HANDOVER.md` for exactly what exists in the
> repository today versus what's still a design intent. Nothing in this file
> should be read as "already implemented."

## 1. Core Vision & Problem Statement

fady exists to remove the two-sided uncertainty in walk-in-heavy venues:

- **The customer's problem:** you don't know if a table/room is actually
  free until you show up. Entertainment hubs (PlayStation lounges, bowling,
  billiards) and F&B venues (restaurants, cafés) both suffer from this —
  wasted trips, wasted time, no way to commit to a plan in advance without
  calling ahead.
- **The venue's problem:** a booking is worthless if it isn't honored on
  either side. A customer who books and never shows costs the venue a real
  slot (and, for F&B, real food-prep cost). A venue that takes a booking and
  then has nothing available when the customer arrives destroys the entire
  point of reserving ahead — trust collapses in both directions if there's
  no mechanism holding either party accountable.

fady's job is to be the accountability layer: real-time availability,
a booking that means something, and a symmetric penalty/reward system so
neither side can freeloose on the other's time.

## 2. Design Philosophy — Anti-UI / Tactical Immersive

**Direction (proposed, not yet built):** move away from a conventional SaaS
dashboard look (light background, card grid, form-first) toward something
that reads more like a live operations console than a website:

- **Dark, OLED-friendly theme** as the default surface — true near-black
  grounds, not just a dark grey reskin, so it reads as a control room, not
  a themed light dashboard.
- **Live Radar View** — availability isn't a table you refresh, it's a feed:
  units/tables pulse into and out of availability as bookings actually
  change, so staff watch it the way you'd watch a live radar or flight
  board, not a spreadsheet.
- **Dynamic interactive boarding passes** instead of a plain confirmation
  row — a customer's booking renders as a single, animated, QR-bearing
  "pass" object (think airline boarding pass, not a table row), which is
  also the literal check-in artifact staff scan at the door.

This is a real departure from the existing interactive demo (which uses a
warm, light-first, Cairo-typeset dashboard look) — the demo reflects the
*earlier* design direction and has not been rebuilt in this new visual
language yet.

## 3. Core Business Rules

### 3.1 Gaming / Billiards (rooms, hourly)

- Booking produces a **dynamic QR boarding pass** — the check-in artifact
  staff scan on arrival.
- **Grace period:** 15–20 minutes from the booking's scheduled start. If
  the customer hasn't checked in by then, the booking **auto-cancels**.
- **Voluntary cancellation before the grace deadline:** zero penalty. The
  venue is notified immediately so the unit frees up for a walk-in.
- **No-show (auto-cancelled via grace timeout):** the customer's
  **Reliability Score drops 20 points**.
- **Venue-side overbooking** (customer arrives, valid booking, no unit
  actually available): venue penalty + an automatic refund to the
  customer's wallet. A **geolocation mismatch check** (customer's
  check-in location doesn't match the venue) is one trigger that can flag
  a booking as a suspected overbooking-avoidance attempt for staff review,
  separate from a legitimate overbooking incident.

### 3.2 F&B / Cafés (tables, party-based, deposit-backed)

- **Mandatory reservation deposit** at booking time — prep and staffing
  commit ahead of the reservation, so a no-show has to cost something
  concrete, not just a rating hit.
- **Cancellation window:** a refund is only available if the customer
  cancels **within 5–10 minutes of making the booking**, OR **up to 2
  hours before the arrival time** — whichever the customer can still hit.
  Once the kitchen's status for that booking flips to **`In-Preparation`**,
  the deposit becomes **non-refundable regardless of timing** — prep cost
  is already sunk at that point.
- **Table-holding grace period:** 15 minutes past the reservation time
  before the table is released back to the floor.

### 3.3 Reliability Score (both verticals)

- Starts at **100** for every customer (per-venue, in the current data
  model — see `HANDOVER.md`'s note on identity scope).
- **No-show** (auto-cancelled booking): **-20 points**.
- Clean/voluntary cancellations before the grace deadline: **no penalty**.
- **Below 60:** the customer is required to pay a **mandatory deposit**
  on every future booking at that venue, regardless of vertical or the
  venue's normal deposit policy — the score itself becomes a gate, not
  just a display number.
- The exact recovery curve (does the score climb back up over time / after
  N clean visits, and by how much) is not yet specified — flagged as an
  open design question in `HANDOVER.md`.

## 4. Open Questions / Not Yet Decided

- **Cross-venue identity:** is the Reliability Score per-venue (as
  currently modeled) or a single global score following the customer
  across every fady venue? This has real privacy and product implications
  and was explicitly deferred in the current spec.
- **Wallet mechanics:** how does a wallet refund get spent — only at the
  venue that overbooked, or platform-wide? Is it cash-out-able?
- **Geolocation mismatch:** what's the actual distance/accuracy threshold,
  and what happens on a genuine false positive (bad GPS, indoor venue)?
- **Score recovery curve:** decay/regrowth rules for the Reliability Score
  after it drops.
