# Milestone 1 (Backend) — Work Split for 6 Members

Deadline: **20/11**. Backend only (NestJS + MongoDB Atlas + Swagger). Frontend-only requirements
(GEN-02/03/04 UI parts, GEN-14…17, ACC-10 redirect) are postponed to Milestone 2.

Every member owns one or more NestJS modules end-to-end: schemas, DTOs, service logic, controller,
Swagger docs, and the seed/sample data for their area. Branch names follow
`feature/<REQ-ID>-<short-description>` from `develop`.

---

## Person 1 — Foundation, Auth & Accounts, Shared Services  *(build first — everyone depends on it)*

| Area | Requirements |
|---|---|
| Project scaffold, config, Mongo connection, Swagger, global validation + error format, pagination helper | GEN-05, GEN-13 |
| Auth (register, login, lockout, logout, refresh, session idle expiry, httpOnly cookies, `/auth/me`) | ACC-01, ACC-04, ACC-05, ACC-06, ACC-08, ACC-19 |
| Users (profile, ownership helpers, self-deactivation) | ACC-09, ACC-11, ACC-12 |
| Admin-assisted password reset | ACC-07a |
| Admin seeding + reference data seeding (countries, cities, airports, currencies, attractions) | ACC-18, GEN-12, FLT-02 (airport list endpoint) |
| Shared services used by everyone: in-app notifications, audit log, image uploads | GEN-01, GEN-07, GEN-08 |

Exports to the team: `JwtAuthGuard`/`RolesGuard` (global), `@Public()`, `@Roles()`, `@CurrentUser()`,
`assertOwner()`, `assertModerates()`, `paginate()`, `ParseObjectIdPipe`, `NotificationsService`,
`AuditService`, `MediaService`, `ReferenceDataService`, `UsersService`, `AccountHooksService`, time-zone utils.

## Person 2 — Airlines, Flights & Flight Search

| Area | Requirements |
|---|---|
| Airline profile (admin creates, moderator edits, logo via MediaService) | FLT-01 |
| Flights: create, edit, cancel, status lifecycle, UTC storage | FLT-03, FLT-05, FLT-06, FLT-30, GEN-06 |
| Cabin inventory (booked / held counters) | FLT-04 |
| Baggage + cancellation policies (tiers) | FLT-08, FLT-09 |
| Search: one-way, round-trip, passenger types, cabin filter, price filter, sorting | FLT-11, FLT-12 (search part), FLT-15 |
| Flight details, moderator bookings view + CSV export | FLT-17, FLT-29 |

Provides to Person 3: atomic `reserveSeats` / `releaseSeats` / `convertHeldToBooked` methods on cabin inventory
and `computeRefundPercent(tiers, daysRemaining)`.

## Person 3 — Flight Booking, Payments & Refunds

| Area | Requirements |
|---|---|
| Flight booking: passengers, baggage, summary, 10-min hold, expiry job | FLT-12 (booking rules), FLT-19, FLT-21, FLT-22 |
| Confirmation, reference, e-ticket PDF, my bookings, cancellation | FLT-23, FLT-25, FLT-26 |
| Booking lifecycle state machine (shared by hotels) | GEN-11 |
| Policies display + acceptance (both booking types) | PAY-02 |
| Stripe PaymentIntents, webhook, retry, refunds, single platform currency | PAY-01, PAY-03, PAY-04 |

Provides to Person 4: a generic `PaymentsService` that works with `type = flight | hotel` and a
`BookingConfirmationHandler` interface the hotel module implements.

## Person 4 — Hotels, Rooms, Hotel Booking & Reviews

| Area | Requirements |
|---|---|
| Hotel profile, photos, check-in/out times, cancellation tiers | HTL-01, HTL-02, HTL-09, HTL-10 |
| Rooms, availability ranges, blocking, deactivation, status view | HTL-03, HTL-04, HTL-05, HTL-06, HTL-08 |
| Search, filters, sorting, available rooms | HTL-11, HTL-12, HTL-15 |
| Multi-room booking with atomic 10-min hold, confirm, list, cancel, moderator view | HTL-16, HTL-17, HTL-18, HTL-20, HTL-21, HTL-22 |
| Reviews + average rating | HTL-23, HTL-24 |

## Person 5 — Itineraries, Budgeting & Exchange Rates

| Area | Requirements |
|---|---|
| Itinerary CRUD, visibility | ITN-01, ITN-03, ITN-20 |
| Days (add/edit/delete/reorder, renumber, derived dates, city grouping) | ITN-05, ITN-07, ITN-08, ITN-09 |
| Activities + images (MediaService) | ITN-10, ITN-12 |
| Budget entries, transport costs, budget summary | ITN-14, ITN-16 |
| FXRatesAPI integration with daily DB cache + fallback | ITN-18 |
| Public search + clone with attribution | ITN-21 |
| Hotel / flight search from itinerary context (reuses P2 and P4 services) | ITN-25, ITN-26 |

## Person 6 — Blog, Community, Moderation & Administration

| Area | Requirements |
|---|---|
| Posts (draft/published), tags, images, search ranking, author page | BLG-01, BLG-02, BLG-03, BLG-04, BLG-08, BLG-09, BLG-10, BLG-12 |
| Comments, likes | BLG-05, BLG-06, BLG-07 |
| Reports + admin resolution (dismiss / hide / delete), hidden-content visibility | GEN-09, GEN-10 |
| Admin: create moderators, list accounts, suspend/reactivate users, moderators and providers | ACC-13, ACC-14, ACC-15, ACC-16 |
| Admin read-only bookings list (reads P3 + P4 collections) | ACC-17 |

---

## Order of work

1. **Week 1:** Person 1 merges the foundation into `develop` first. Others design schemas and DTOs in parallel.
2. **Week 2:** P2 and P4 finish catalog + search; P3 builds booking/payments against P2's inventory methods; P5 and P6 are independent.
3. **Week 3:** Integration: hotel booking ↔ payments, itinerary ↔ search, admin ↔ providers.
4. **Week 4:** Swagger polish, seed data, end-to-end test of every flow, `develop → main`.

## Integration contracts (agree before coding)

- Bookings (P3 and P4) register a deactivation check with `AccountHooksService` so ACC-12 blocks deactivation while upcoming Confirmed bookings exist.
- Every booking/provider/admin action that the requirements tie to GEN-01 calls `NotificationsService.notify()`.
- Every admin action (suspend, reactivate, delete, hide, password reset) calls `AuditService.log()`.
- Lists use `paginate()` with page size 10 by default (GEN-05).
- Content authored by deactivated users is hidden: filter with `UsersService.getDeactivatedUserIds()` (P5, P6).
