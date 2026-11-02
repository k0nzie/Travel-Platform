# Person 4: hotels, rooms, hotel booking and reviews

Read [CONVENTIONS.md](CONVENTIONS.md) first. Everything below builds on it, and on the patterns
flights and flight bookings already use, so copy from them rather than inventing new ones.

Requirements: HTL-01 to HTL-24 (mandatory ones), plus the hotel side of PAY-01 to PAY-04, ACC-11,
ACC-12, GEN-01, GEN-08 and GEN-11. HTL-26 (moderator replies) is an optional bonus; do it last.

## 1. Modules (one-way dependencies, like flights)

```
modules/hotels/            HotelsModule: hotels, rooms, availability, blocks, policies, search
modules/hotel-bookings/    HotelBookingsModule: reservations, holds, payments, reviews
```

`HotelBookingsModule` imports `HotelsModule`, `PaymentsModule` and `UsersModule`. `HotelsModule`
imports neither bookings nor payments. When hotels needs booking data (HTL-06 "reject if a
reservation overlaps", HTL-08 room status, HTL-22 reservations list), add a `HotelHooksService`
in hotels and register a bridge from hotel bookings, exactly like `FlightHooksService`.

Register both modules in `app.module.ts` (slots already there).

## 2. Endpoints (official table, section 8.5 / 8.6 of the PDF)

| Method | Endpoint | Requirement |
|---|---|---|
| POST | `/api/hotels` | HTL-01 (admin) |
| GET | `/api/hotels/search` | HTL-11, HTL-12 (public) |
| GET | `/api/hotels/:id` | HTL-02 (public) |
| PATCH | `/api/hotels/:id` | HTL-01 (assigned moderator) |
| POST | `/api/hotels/:id/rooms` | HTL-03 |
| PATCH | `/api/hotels/:id/rooms/:roomId` | HTL-05 |
| DELETE | `/api/hotels/:id/rooms/:roomId` | HTL-06 |
| GET | `/api/hotels/:id/rooms/available` | HTL-15 (public) |
| POST | `/api/hotels/:id/rooms/:roomId/availability` | HTL-04 |
| PATCH | `/api/hotels/:id/rooms/:roomId/availability` | HTL-05, HTL-06 (edit ranges, block dates) |
| GET | `/api/hotels/:id/availability` | HTL-08 |
| PUT | `/api/hotels/:id/policies` | HTL-09, HTL-10 |
| GET | `/api/hotels/:id/reservations` | HTL-22 |
| POST | `/api/hotel-bookings` | HTL-16, HTL-18 (hold) |
| GET | `/api/hotel-bookings` | HTL-20 (`scope=upcoming\|past\|cancelled`) |
| GET | `/api/hotel-bookings/:id` | HTL-20 |
| POST | `/api/hotel-bookings/:id/cancel` | HTL-21 |
| POST | `/api/hotel-bookings/:id/review` | HTL-23 |
| PATCH | `/api/reviews/:id` | HTL-23 |
| DELETE | `/api/reviews/:id` | HTL-23 |
| GET | `/api/hotels/:id/reviews` | HTL-24 (public, newest first, paginated) |
| POST | `/api/reviews/:id/reply` | HTL-26 (optional) |

Payment and policies are already built and shared: `GET /api/bookings/hotel/:id/policies`,
`POST /api/bookings/hotel/:id/accept-policies`, `POST /api/payments`, `POST /api/payments/:id/retry`,
`GET /api/refunds/:id`. They start working for hotels as soon as you register your handler (section 5).

Also add `GET /api/hotel-bookings/:id/cancellation-preview` (HTL-21 "after viewing the refund"),
like flights.

## 3. Data model

All money in **cents** (`...Minor`). All stay dates are **date-only UTC midnight** (`parseDateOnly`);
a stay covers the nights `checkIn <= night < checkOut`.

```
Hotel        name, address, cityId (ref City), countryCode, description, starClass (1-5),
             amenities[], status: 'active' | 'inactive' (ACC-15),
             checkInTime 'HH:mm', checkOutTime 'HH:mm' (HTL-09),
             cancellationTiers [{ minDays, refundPercent }] (HTL-10, validateTiers),
             ratingSum, ratingCount (HTL-23/24; average = sum / count)
             photos: MediaService, MediaOwnerType.Hotel (max 5)

Room         hotelId, number (unique per hotel), type, beds, maxOccupancy (>= 1),
             pricePerNightMinor (> 0), status: 'active' | 'inactive',
             availability: [{ from, to }]   // HTL-04 bookable ranges, non-overlapping
             everReserved: boolean          // HTL-06 delete allowed only if false

RoomNight    roomId, hotelId, night (Date), kind: 'hold' | 'booked' | 'blocked',
             bookingId?                     // unique index { roomId: 1, night: 1 }

HotelBooking reference, userId, hotelId, checkIn, checkOut, nights,
             rooms: [{ roomId, number, type, adults, children, pricePerNightMinor, subtotalMinor }],
             totalMinor, currency, status (BookingStatus), holdExpiresAt,
             policies snapshot { cancellationTiers, checkInTime, checkOutTime },
             paymentId, cancellation { refundMinor, reason }, confirmedAt, cancelledAt, completedAt

Review       bookingId (unique), hotelId, userId, rating 1-5, text <= 1000, status (GEN-10 hiding)
```

## 4. Concurrency: holding several rooms at once (HTL-16, HTL-18)

Use **one document per room per night** with a **unique index on `{ roomId, night }`**. The database
then refuses any overlap for you, with no read-check-write races.

Hold (inside `connection.transaction`, like `FlightBookingsService.createHold`):
1. Validate dates (check-out after check-in, check-in not in the past), rooms in the same hotel,
   active, within an availability range, occupancy per room, at least one adult.
2. Price on the server from the rooms' current `pricePerNightMinor` and snapshot it.
3. Create the `HotelBooking` (status `pending_payment`, `holdExpiresAt = now + 10 min`).
4. `insertMany` a `RoomNight { kind: 'hold', bookingId }` for every room and night, with the session.
   A duplicate-key error (`code 11000`) means some room is booked, held or blocked: throw
   `409 ROOMS_UNAVAILABLE`. The transaction rolls back, so **nothing** is held (HTL-18).

Then:
- **Confirm** (payment succeeded): booking `pending_payment -> confirmed`, nights `hold -> booked`,
  one transaction.
- **Expire / cancel**: move the status and `deleteMany({ bookingId })` in one transaction. That
  releases the rooms.
- **Block dates** (HTL-06): insert `kind: 'blocked'` nights. The same unique index rejects a
  block over any hold or booking.
- **Search and availability** (HTL-11, HTL-15, HTL-08): one query on `RoomNight` for the stay
  (`night >= checkIn, < checkOut`, index `{ hotelId, night }`) gives the taken room ids. Every
  other active room whose availability covers the stay is free.
- Before holding, expire this user's or these rooms' holds whose `holdExpiresAt` has passed, so
  an expired hold never blocks between cron runs ("unexpired hold" in HTL-18).

## 5. Payments, refunds and lifecycle

Copy `flight-bookings.service.ts`; the hotel version is smaller.

```ts
@Injectable()
export class HotelBookingsService implements OnModuleInit, BookingConfirmationHandler {
  constructor(
    private readonly paymentHooks: PaymentHooksService,
    private readonly payments: PaymentsService,
    private readonly accountHooks: AccountHooksService,
    ...
  ) {}

  onModuleInit() {
    this.paymentHooks.register(BookingType.Hotel, this);
    this.accountHooks.registerDeactivationCheck('hotel-bookings', async (userId) => /* confirmed, checkOut > now */);
  }

  getPaymentContext(bookingId, user)  // assertOwner, pending + hold not expired, policies snapshot
  onPaymentSucceeded(bookingId, paymentId)  // idempotent; false if the hold was lost -> full refund
}
```

- **Expiry cron** (every 30 s): `pending_payment -> expired`, delete nights, then
  `payments.cancelOpenIntent(BookingType.Hotel, id)`, then notify.
- **Cancel** (HTL-21): confirmed only, before check-in. Refund =
  `computeRefundPercent(snapshot.cancellationTiers, daysUntil(checkIn))` on the full total. Inside the
  transaction: status, delete nights, `payments.queueRefund(BookingType.Hotel, id, refundMinor, 'user_cancelled', session)`.
  After commit: `payments.sendQueuedRefunds(result)`.
- **Completed** (HTL-23): a cron moves `confirmed -> completed` once `checkOut` has passed.
- Every status change goes through one `moveStatus()` that calls `canTransition()` (GEN-11).
- **Notifications** (GEN-01): confirmed, cancelled (with refund), expired. Refund notifications come
  from payments automatically.
- **Booking details** include `payment: await payments.summaryForBooking(BookingType.Hotel, id)`
  (PAY-03 refund status).

## 6. Reviews (HTL-23, HTL-24)

- One review per **completed** booking (unique `bookingId`), only by its owner.
- Keep the average exact and race-free with `$inc` on the hotel: create `+rating / +1`, edit
  `+(new - old)`, delete `-rating / -1`. Average = `ratingSum / ratingCount`; unrated hotels have
  `ratingCount = 0` and are excluded when a rating filter is set (HTL-12).
- Show deactivated authors as "Deleted user" with `publicAuthor()` (ACC-12).

## 7. What others need from you

| Who | Needs | Expose |
|---|---|---|
| Person 5 (ITN-25) | hotel search for a city group's dates | export `HotelsService.search(dto)` from `HotelsModule` |
| Person 6 (ACC-15) | deactivate / reactivate a hotel | `HotelsService.setStatus(id, status)`; search must hide inactive hotels, existing bookings stay valid |
| Person 6 (ACC-17) | admin bookings list | `HotelBookingsService.listAllForAdmin(query)` (no passport-like data) |
| Person 6 (GEN-10) | hide / delete reviews | `ReviewsService.setHidden(id)` / `remove(id)`, adjusting the rating sums |

## 8. Tests

- Copy `test/flight-bookings.e2e.ts` into `test/hotel-bookings.e2e.ts` and add a
  `test:hotel-bookings` script. It already has the fake Stripe, the real replica set and the
  helpers.
- Must-have cases: two concurrent holds on the same room, only one wins; a multi-room hold where
  one room is taken holds nothing; expiry frees the rooms; cancellation refunds under the tiers;
  blocking over a reservation is rejected; one review per completed stay, average updates.
- Add your schemas to `flights/objectid-schema.test.ts`.

## 9. Checklist before your PR

- [ ] Every official endpoint in section 2 exists and its Swagger summary starts with the requirement ID.
- [ ] Money in cents, dates date-only, ids are ObjectId refs (`MongooseSchema.Types.ObjectId`).
- [ ] Moderators can touch only their hotel (`assertModerates`), users only their bookings (`assertOwner`).
- [ ] No reads or writes of another module's collections.
- [ ] `npm run format && npm run typecheck && npm run lint && npm test && npm run test:hotel-bookings`.
- [ ] Branch `feature/HTL-xx-...` from `develop`, PR into `develop`, prompts in `AI_PROMPTS.txt`.
