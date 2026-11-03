# Backend conventions (read before starting your module)

Everything below already exists in the foundation. Use it instead of writing your own.

## Folder layout

```
backend/src/
  common/            shared building blocks (enums, decorators, guards, pipes, utils)
  config/            typed config + env validation
  database/seed/     `npm run seed`
  modules/<feature>/
    schemas/         Mongoose schemas
    dto/             request DTOs (class-validator + @ApiProperty)
    <feature>.service.ts      business rules + DB
    <feature>.controller.ts   HTTP only — no business logic
    <feature>.module.ts
```

Register your module in `src/app.module.ts` (there is a commented slot for each person).

## Auth: every route is protected by default

| You want | Write |
|---|---|
| Guests allowed | `@Public()` (if a session cookie exists, `@CurrentUser()` is still filled) |
| Any logged-in role | nothing |
| Specific roles | `@Roles(Role.Admin)` or `@Roles(Role.AirlineModerator)` |
| The current user | `@CurrentUser() user: AuthUser` |
| Swagger padlock | `@ApiCookieAuth('access_token')` on the controller |

Testing in Swagger: call `POST /api/auth/login` once; the browser keeps the cookies and sends them on every request.

## Ownership and provider scope (ACC-11)

```ts
import { assertOwner, assertModerates } from '../../common/utils/access.util';

assertOwner(itinerary.ownerId, user, { resource: 'Itinerary' });                 // 404 for strangers
assertOwner(booking.userId, user, { allowAdmin: true, resource: 'Booking' });
assertModerates(user, ProviderType.Hotel, hotel._id);                           // 403 if not their hotel
```

Always check in the **service**, not just the controller.

## IDs, validation, errors

- Route ids: `@Param('id', ParseObjectIdPipe) id: string`.
- DTOs: class-validator decorators. Unknown fields are rejected automatically.
- Throw Nest exceptions. To attach a field error or a machine code:
  ```ts
  throw new ConflictException({ message: 'Room already booked', code: 'ROOM_UNAVAILABLE',
    errors: [{ field: 'roomIds', messages: ['Room 101 is no longer available'] }] });
  ```
  Every error reaches the client as `{ statusCode, error, message, code?, errors?, path, timestamp }`.

## Lists (GEN-05)

```ts
export class HotelSearchDto extends PaginationQueryDto { ... }   // adds page & limit (default 10)
return paginate(this.hotelModel, filter, { page: q.page, limit: q.limit, sort: { price: 1 } });
// -> { items, page, limit, total, totalPages }
```

For aggregations, compute the slice yourself and return `toPage(items, total, page, limit)`.
Escape user search text with `escapeRegex()` before building a RegExp.

## Shared services (all global — just inject them)

| Service | Use for |
|---|---|
| `NotificationsService.notify(userId, {type, title, message, link, data})` / `notifyMany(ids, ...)` | GEN-01 notifications. Never throws. |
| `AuditService.log(adminUser, {action, targetType, targetId, reason})` | GEN-07, every admin action |
| `MediaService.saveImages / list / remove / removeAllFor / copyAll` + `@ImagesUpload()` / `@SingleImageUpload()` | GEN-08 uploads |
| `ReferenceDataService.resolveAirport / airportsInCity / getCityById / assertCountryCodes / assertSupportedCurrency` | validating against seeded data |
| `UsersService` (import `UsersModule`) — `create`, `setStatus`, `findById`, `getDeactivatedUserIds` | P6 admin features, hiding deactivated users' content |
| `publicAuthor(user)` from `users.service.ts` | ACC-12: show "Deleted user" for deactivated authors of comments / reviews |
| `AccountHooksService.registerDeactivationCheck(...)` (import `UsersModule`) | P3 & P4: block ACC-12 while upcoming confirmed bookings exist |
| `PaymentHooksService.register(BookingType.X, handler)` + `PaymentsService` (import `PaymentsModule`) | P4: Stripe payment, policy acceptance and refunds for hotel bookings |
| `computeRefundPercent(tiers, days)` / `validateTiers` from `common/utils/cancellation-tiers.ts` | FLT-09 and HTL-10 refund tiers (`{ minDays, refundPercent }`) |

## Time

- Store instants as UTC `Date`. Flights use `localToUtc(local, airport.timezone)` and `utcToLocalIso(date, tz)` (GEN-06).
- Flight search by local day: `localDayRangeUtc('2026-11-05', airport.timezone)`.
- Hotel stays and itinerary dates are date-only: `parseDateOnly`, `addDays`, `todayUtc`.
- Cancellation tiers: `computeRefundPercent(tiers, daysUntil(departureAt or checkIn))`.

## Bookings (P3 + P4)

- Use `BookingStatus` and `canTransition(from, to)` from `common/constants/enums.ts` (GEN-11).
- Holds must be atomic: use a single conditional `updateOne`/`findOneAndUpdate` (e.g. `$inc` with a `$expr` guard on available seats) or a Mongo transaction — never "read, check, then write".
- `ScheduleModule` is already enabled, so `@Cron(...)` works for hold expiry and status updates.
- `rawBody` is enabled in `main.ts` for the Stripe webhook signature check (`req.rawBody`).

## Response shape (applies automatically)

- Every response uses **`id` (string)**, never `_id` or `__v`. A global interceptor
  (`common/interceptors/serialize-ids.interceptor.ts`) renames them and turns every ObjectId into a
  string, for hydrated documents and `.lean()` results alike. Don't map `_id` yourself, and
  write `id` in Swagger response schemas.
- Errors keep the shared shape from `AllExceptionsFilter`.

## Money (PAY-04)

- Store and return money as **integer minor units** (cents) in the platform currency, with a
  `Minor` suffix: `pricePerNightMinor`, `totalMinor`, `refundMinor`. That is what Stripe charges,
  and integers never round wrongly.
- Snapshot prices and policies onto the booking when it is created; later edits by a provider
  must not change existing bookings (FLT-05, HTL-05).
- Flights are the one older exception (major units); `FlightsInventoryAdapter` converts them.

## Naming

- Enum **values** are lowercase snake case: `pending_payment`, `active`, `hotel_moderator`.
  (Flights' `Scheduled` / `Economy` predate this and stay as they are.)
- Mention the requirement IDs in every `@ApiOperation` summary, e.g. `'HTL-16: book rooms'`.
- Endpoint paths follow the official table in the project PDF (section 8) exactly; extra helper
  endpoints are fine, missing or renamed official ones are not.

## Schemas

- References are **`@Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })`** with
  `import { Schema as MongooseSchema } from 'mongoose'`. `type: Types.ObjectId` silently becomes
  an untyped (`Mixed`) field. Add your schemas to `flights/objectid-schema.test.ts`.
- Add the indexes your queries need (search filters, `userId`, status + date for cron jobs).
- Return explicit, field-by-field objects (or give the method an explicit return type). Spreading a
  whole `.lean()` document (`{ ...doc, x }`) makes TypeScript infer enormous types: slow builds and
  `TS7056` errors.

## Cross-module hooks (one pattern, three uses)

When module A must call back into module B, but B already imports A, B **registers** with a hooks
service owned by A. A defines the interface; B implements it and registers in `onModuleInit`.

| Hooks service (owner) | Registered by | Used for |
|---|---|---|
| `AccountHooksService` (users) | flight bookings, hotel bookings | ACC-12 deactivation checks |
| `PaymentHooksService` (payments) | flight bookings, hotel bookings | PAY-01/02/03 per booking type |
| `FlightHooksService` (flights) | flight bookings | FLT-05, FLT-06, FLT-29 |

```ts
constructor(private readonly paymentHooks: PaymentHooksService) {}
onModuleInit() { this.paymentHooks.register(BookingType.Hotel, this); }
```

Rules:
- **A module owns its collections.** Never read or write another module's collection; call its
  service or a hook.
- Hooks fail loudly (an exception) when nothing is registered; never silently skip work.
- Handlers must be idempotent: they can be called again on retry.
- Need a new hook? Name it `<Owner>HooksService`, put the interface next to it, and add it to
  this table.

## Before you open a PR

```bash
npm run format        # Prettier, the one code style
npm run typecheck     # tsc --noEmit
npm run lint
npm test              # unit tests
npm run test:bookings # end-to-end flows (needs ~1 GB free disk for the test database)
```

## Git

- Long-lived branches: **`main`** (milestone releases) and **`develop`** (integration). Never commit to `main`.
- Branch from the latest `develop`: `feature/HTL-16-hotel-booking`, `fix/HTL-18-overlapping-hold`.
- Commits: `feat(hotels): add room availability`, never `update` / `fix` / `person 4`.
- Open PRs into `develop`; they reference requirement IDs and are reviewed by the team leader.
- Merge `develop` into your branch often and resolve conflicts yourself before asking for review.
- Log material AI prompts in `AI_PROMPTS.txt`.
