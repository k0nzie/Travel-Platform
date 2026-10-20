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

## Time

- Store instants as UTC `Date`. Flights use `localToUtc(local, airport.timezone)` and `utcToLocalIso(date, tz)` (GEN-06).
- Flight search by local day: `localDayRangeUtc('2026-11-05', airport.timezone)`.
- Hotel stays and itinerary dates are date-only: `parseDateOnly`, `addDays`, `todayUtc`.
- Cancellation tiers: `daysUntil(departureAt)`.

## Bookings (P3 + P4)

- Use `BookingStatus` and `canTransition(from, to)` from `common/constants/enums.ts` (GEN-11).
- Holds must be atomic: use a single conditional `updateOne`/`findOneAndUpdate` (e.g. `$inc` with a `$expr` guard on available seats) or a Mongo transaction — never "read, check, then write".
- `ScheduleModule` is already enabled, so `@Cron(...)` works for hold expiry and status updates.
- `rawBody` is enabled in `main.ts` for the Stripe webhook signature check (`req.rawBody`).

## Git

- Branch from `develop`: `feature/FLT-11-flight-search`.
- Commits: `feat(flights): add round-trip search`.
- PRs reference requirement IDs and are reviewed by the team leader.
- Log material AI prompts in `AI_PROMPTS.txt`.
