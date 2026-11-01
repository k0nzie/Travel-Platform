# Travel Planning & Booking Platform

Software Project I — Winter 2026. NestJS + MongoDB Atlas backend, Next.js frontend (Milestone 2).

- Work split: [`docs/WORK_SPLIT.md`](docs/WORK_SPLIT.md)
- Backend conventions for teammates: [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md)
- Flight booking + payments integration: [`docs/P3_BOOKING_PAYMENTS.md`](docs/P3_BOOKING_PAYMENTS.md)

## Backend setup

Requirements: Node.js 20+ and access to the team's MongoDB Atlas cluster.

```bash
cd backend
npm install
cp .env.example .env        # fill MONGODB_URI, JWT_ACCESS_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed                # reference data (countries, cities, airports, currencies, attractions) + admin
npm run seed:flights       # Person 2: migrate legacy flights/airlines, then insert sample data (run `npm run seed` first)
npm run start:dev
```

`seed:flights` is idempotent. It first normalizes legacy `status`/cabin casing, adds missing cabin `_id`s, backfills `departureDay` and airline `status`/baggage/cancellation policy, keeping `held`/`booked` counts. It then inserts sample rows only if absent. Preview with `npm run seed:flights -- --dry-run` (or `SEED_DRY_RUN=1`): prints the migration report, writes nothing. Rerun if the report lists `conflicts`.

- API: http://localhost:4000/api
- Swagger UI: http://localhost:4000/api/docs

### Trying it in Swagger

1. `POST /api/auth/register` — create a traveller.
2. `POST /api/auth/login` — the response sets httpOnly cookies; Swagger sends them automatically afterwards.
3. `GET /api/auth/me`, `PATCH /api/users/me`, `GET /api/notifications`, ...
4. Log in as the seeded admin to try `POST /api/admin/users/{id}/reset-password` and `GET /api/admin/audit-logs`.

## Implemented so far (Person 1 — foundation)

| Area | Endpoints | Requirements |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/change-password` | ACC-01, 04, 05, 06, 08, 19 |
| Users | `GET /users/me`, `PATCH /users/me`, `DELETE /users/me` | ACC-09, 11, 12 |
| Admin | `POST /admin/users/:id/reset-password`, `GET /admin/audit-logs` | ACC-07a, GEN-07 |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` | GEN-01 |
| Reference data | `GET /airports`, `GET /airports/:id`, `GET /reference/countries`, `/cities`, `/currencies`, `/attractions` | FLT-02, GEN-12 |
| Uploads | `MediaService` + upload decorators, files served from `/uploads` | GEN-08 |
| Cross-cutting | global auth + roles guards, validation, error format, pagination | GEN-05, GEN-13, ACC-18 |

## Implemented so far (Person 3 — flight booking and payments)

Runs against stub flights until Person 2's module is merged; see the integration guide.
Test with `npm run test:bookings`.

| Area | Endpoints | Requirements |
|---|---|---|
| Booking | `POST /flight-bookings/quote`, `POST /flight-bookings`, `GET /flight-bookings`, `GET /flight-bookings/:id` | FLT-12, 19, 21, 22, 23, 26 |
| Tickets and cancelling | `GET /flight-bookings/:id/e-ticket`, `GET /flight-bookings/:id/cancellation-preview`, `POST /flight-bookings/:id/cancel` | FLT-25, 26, PAY-03 |
| Payments | `GET /payments/checkout/:type/:bookingId`, `POST /payments/intent`, `POST /payments/webhook`, `GET /payments/:id`, `POST /payments/:id/sync`, `POST /payments/:id/test-confirm` | PAY-01 to 04, GEN-11 |

### Auth design (for the discussion)

- **Tokens never touch JavaScript** (ACC-19): a 15-minute JWT access token and a 7-day random refresh token,
  both in `httpOnly`, `Secure`, `SameSite` cookies. The refresh cookie is scoped to `/api/auth`.
- **Server-side sessions**: every login creates a `sessions` document. The access token carries its id, so
  logout, suspension, password changes and the **30-minute idle timeout** (ACC-06) take effect immediately.
  The refresh token is stored only as a SHA-256 hash and rotates on every refresh.
- **Lockout** (ACC-05): failed attempts are counted atomically; the 5th failure locks the account for 15 minutes.
- **Forced password change** (ACC-07a, ACC-13): `mustChangePassword` blocks every route except
  `/auth/me`, `/auth/change-password` and `/auth/logout` until the user picks a new password.
- **Passwords** are bcrypt hashes (GEN-13); hashes and lockout fields are never selected or serialised.
