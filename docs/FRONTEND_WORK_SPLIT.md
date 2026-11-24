# Milestone 2 (Frontend) — Work Split for 7 Members

Deadline: **11/12**. Next.js (App Router, React, TypeScript) in a new `frontend/` folder, talking to the
finished NestJS backend. Each person builds the screens for **the same area they built in the backend**,
so everyone already knows their endpoints in Swagger (`http://localhost:4000/api/docs`).

Frontend checks and route guards are for user experience only. The backend stays the authority for
validation and permissions (project description §7.2).

---

## Timeline

| Dates | What happens |
|---|---|
| **24–27/11** | Person 1 builds the foundation (scaffold, API client, auth, layout, UI kit) and merges it into `develop` by **27/11**. Everyone else: study your endpoints in Swagger, sketch your pages, and build them with sample data on your branch. |
| **28/11–6/12** | Everyone connects their pages to the real API. Shared components (below) are merged early so others can use them. |
| **7–9/12** | Integration week: every person tests the full flows of all roles, fixes bugs, checks loading / error / empty states and phone layout. |
| **10/12** | Freeze. Merge `develop` into `main`, final README and AI_PROMPTS.txt. |
| **11/12** | Deadline. |

---

## Person 1 — Foundation, Auth & Account  *(build first — everyone depends on it)*

| Area | Requirements |
|---|---|
| Next.js scaffold in `frontend/`, TypeScript, styling setup, ESLint/Prettier, `.env.example` | — |
| API client for the browser and for the server (see *Shared contracts*), error parsing for field-level messages | GEN-02, GEN-13 |
| Auth state from `GET /auth/me`, silent refresh on 401, logout | ACC-19, ACC-06 |
| Route protection by role; a guest sent to login returns to what they were doing (`?returnTo=`) | ACC-10, ACC-11 |
| Register (consent checkbox, password rules), login (generic error, lockout and suspended messages) | ACC-01, ACC-04, ACC-05 |
| Profile (name, phone, preferred currency), change password, forced password change for new moderators, deactivate account | ACC-07a (forced change), ACC-08, ACC-09, ACC-12 |
| Layout: header, role-based navigation, footer, notification bell with unread count, notifications page | GEN-01, GEN-14 |
| UI kit used by everyone: button, inputs, form field with error, confirm dialog, table, pagination, empty state, loading and error states, toast, image uploader (JPG/PNG, 5 MB, max 5) | GEN-03, GEN-04, GEN-05, GEN-08, GEN-15…17 |
| Home page | — |

Also: team integration lead — reviews and merges PRs into `develop`, keeps the README setup steps current.

## Person 2 — Flight Search & Airline Moderator Dashboard

| Area | Requirements |
|---|---|
| Flight search form: airports from the official list, date, passengers (adult / child / infant), one-way or round trip, cabin filter | FLT-02, FLT-11, FLT-12 (search) |
| Results: price filter (error if min > max), sort by price / duration / departure, "no flights found" | FLT-15, GEN-04 |
| Flight details: airline, times in each airport's local time zone, duration, cabins with price, seats left and baggage allowance, cancellation policy | FLT-17, GEN-06 |
| Airline moderator: airline profile and logo | FLT-01 |
| Airline moderator: baggage policy and cancellation tiers | FLT-08, FLT-09 |
| Airline moderator: flights list, create / edit flight with cabins, cancel flight (with confirmation) | FLT-03, FLT-04, FLT-05, FLT-06, FLT-30 |
| Airline moderator: bookings per flight, seats left per cabin, passenger list CSV | FLT-29 |

Shares: a `FlightResults` component that Person 5 reuses for ITN-26.

## Person 3 — Booking Checkout, Payments & My Bookings

| Area | Requirements |
|---|---|
| Flight booking: passenger details, date of birth, passport, extra bags; booking summary | FLT-12 (rules), FLT-19, FLT-21 |
| **Shared checkout** for flights and hotels: hold countdown (10 min), policies with acceptance checkbox, Stripe card form (Stripe Elements), retry on failure, expired-hold message | FLT-22, HTL-18, PAY-01, PAY-02, PAY-04 |
| Confirmation pages: reference, details, e-ticket PDF download (flights) | FLT-23, HTL-17 |
| My bookings: flights and hotels grouped as Upcoming / Past / Cancelled, details pages | FLT-25, HTL-20 |
| Cancellation: refund preview, confirmation, refund status (Pending / Refunded / Failed) | FLT-26, HTL-21, PAY-03 |

Shares: `<Checkout bookingType bookingId />`, which Person 4 sends hotel bookings to after the hold.

## Person 4 — Hotels, Hotel Booking, Reviews & Hotel Moderator Dashboard

| Area | Requirements |
|---|---|
| Hotel search: city or country, dates, guests, rooms; filters (price per night, minimum rating) and sorting | HTL-11, HTL-12 |
| Hotel details: profile, photos, amenities, check-in/out times, policy, rating and reviews, available rooms when dates are given | HTL-02, HTL-24 |
| Room selection: pick rooms, assign adults and children (ages) per room, total price → create the hold → Person 3's checkout | HTL-15, HTL-16 |
| Reviews: write, edit, delete one review per completed stay | HTL-23 |
| Hotel moderator: hotel profile and photos, check-in/out times, cancellation tiers | HTL-01, HTL-09, HTL-10 |
| Hotel moderator: rooms (add, edit, deactivate, delete), availability ranges, blocked dates | HTL-03…HTL-06 |
| Hotel moderator: room status calendar (Available / Booked / Blocked) and reservations list | HTL-08, HTL-22 |

Shares: a `HotelResults` component that Person 5 reuses for ITN-25.

## Person 5 — Itineraries & Budgets

| Area | Requirements |
|---|---|
| My itineraries list; create / edit / delete (title, countries, start date, visibility) | ITN-01, ITN-03, ITN-20 |
| Itinerary editor: days with city and notes, add / delete / move days, city groups | ITN-05, ITN-07, ITN-08, ITN-09 |
| Activities with time, cost and images | ITN-10, ITN-12 |
| Budget entries, transport costs, budget summary by category, day and city group, converted to the user's currency with the rate date | ITN-14, ITN-16, ITN-18 |
| Public itinerary search (keyword, duration, country, city) and read-only public view; clone | ITN-21 |
| Hotels and flights from an itinerary (reuses Person 4's and Person 2's results components) | ITN-25, ITN-26 |

## Person 6A — Blog & Community

| Area | Requirements |
|---|---|
| Blog list with tag filter, search (title, tags, author), excerpts, "no results" | BLG-02, BLG-09 |
| Post page: body, tags, images, likes, comments (add, edit, delete own) | BLG-02, BLG-05, BLG-06, BLG-07 |
| Editor: create / edit / delete, draft or publish, up to 5 tags, images | BLG-01, BLG-04, BLG-08, BLG-10 |
| My posts (with drafts, like and comment counts), tag pages, public author page | BLG-03, BLG-08, BLG-12 |

Shares: a `<ReportButton type id />` (GEN-09) that Persons 4 and 5 put on reviews and itineraries.

## Person 6B — Administration & Moderation

| Area | Requirements |
|---|---|
| Accounts list: search, filter by role and status, suspend / reactivate, reset password | ACC-07a, ACC-14, ACC-15, ACC-16 |
| Create airline and hotel profiles; create moderators linked to one provider | ACC-13, FLT-01, HTL-01 |
| Deactivate / reactivate airlines and hotels | ACC-15 |
| All bookings (read-only), filters by type, status and date range | ACC-17 |
| Reports queue: dismiss, hide or delete; hide / unhide / delete any post, comment, review or itinerary directly | GEN-09, GEN-10 |
| Audit log | GEN-07 |

---

## Rendering strategy (project description §9 — be ready to justify these)

| Page | Strategy | Owner |
|---|---|---|
| Published blog post, public author page, public itinerary detail | ISR / static | 6A, 5 |
| Blog listing / search, public itinerary search, flight / hotel search | Dynamic SSR | 6A, 5, 2, 4 |
| Blog editor and drafts, itinerary editor | Dynamic SSR + Client Components | 6A, 5 |
| Likes and comments | Client Components | 6A |
| Private itinerary detail, my bookings, admin and moderator dashboards | Dynamic SSR | 5, 3, 2, 4, 6B |

Public pages get proper `metadata` for SEO.

---

## Shared contracts (agree before coding)

- **Folder layout** (App Router): `app/(public)/…`, `app/login`, `app/register`, `app/account/…`,
  `app/flights/…`, `app/hotels/…`, `app/checkout/[type]/[id]`, `app/bookings/…`, `app/itineraries/…`,
  `app/blog/…`, `app/authors/[id]`, `app/moderator/airline/…`, `app/moderator/hotel/…`, `app/admin/…`.
  Shared UI in `components/ui/` (Person 1 only); your own components in `components/<your-area>/`.
- **One API client** (Person 1): `lib/api.ts` for the browser and `lib/server-api.ts` for server
  components. Nobody calls `fetch` to the backend directly.
- **Same-origin calls**: Next.js rewrites `/api/:path*` to `http://localhost:4000/api/:path*`, so the
  httpOnly cookies just work. Server components forward the user's cookies to the backend. Tokens are
  never stored in localStorage or JavaScript (ACC-19).
- **Types from Swagger**: generate them with `npx openapi-typescript http://localhost:4000/api/docs-json -o lib/api-types.ts`
  instead of writing response types by hand.
- **Errors**: the backend returns `{ message, code, errors: [{ field, messages }] }`. Show `errors` under
  the matching fields and `message` as a toast.
- **Lists**: every list uses the shared `Pagination` (page size 10, GEN-05) and `EmptyState` (GEN-04).
- **Destructive actions** (delete, cancel) always go through the shared `ConfirmDialog` (GEN-03).
- **Money** comes in minor units (cents); format it with the shared `formatMoney()`.
- **Environment**: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `BACKEND_URL` in `frontend/.env.local`,
  listed in `frontend/.env.example`.

## Git workflow (same as Milestone 1)

- Branch from the latest `develop`: `feature/<REQ-ID>-<short-description>`, e.g. `feature/FLT-11-flight-search-page`.
- Small PRs into `develop`, with the requirement IDs in the title; Person 1 reviews and merges.
- Never commit `.env` / `.env.local` or `node_modules`.
- Add your AI prompts to `AI_PROMPTS.txt` as you go.
