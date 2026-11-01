# Flight booking and payments (Person 3): integration guide

Covers FLT-12 (booking rules), FLT-19, 21, 22, 23, 25, 26, GEN-11, PAY-01 to PAY-04.
Flights are currently **stubbed**, so read section 1 if you are Person 2.

## Booking flow

| Step | Endpoint |
|---|---|
| Price summary, nothing held | `POST /api/flight-bookings/quote` |
| Hold seats for 10 minutes | `POST /api/flight-bookings` |
| See amount and policies | `GET /api/payments/checkout/flight/:bookingId` |
| Accept policies, start or retry payment | `POST /api/payments/intent` |
| Payment confirmed | Stripe webhook, or `POST /api/payments/:id/sync` |
| Download ticket | `GET /api/flight-bookings/:id/e-ticket` |
| My bookings | `GET /api/flight-bookings?scope=upcoming`, `GET /api/flight-bookings/:id` |
| Refund preview, then cancel | `GET /api/flight-bookings/:id/cancellation-preview`, `POST /api/flight-bookings/:id/cancel` |

All money is stored as integer minor units (cents) in the platform currency.

MongoDB must be a replica set, because bookings use transactions. Atlas already is one.

## 1. Person 2: replacing the stub

Bookings only use `FlightInventoryPort` ([flight-inventory.port.ts](../backend/src/modules/flight-bookings/ports/flight-inventory.port.ts)).

1. Implement that interface on your flights service.
   - `getFlightForBooking(id)` returns a `FlightSnapshot`. Map your documents to it, with fares in integer minor units per passenger type.
   - `reserveSeats`, `releaseSeats`, `convertHeldToBooked` and `computeRefundPercent` are the methods already agreed in the work split.
   - **`releaseBookedSeats` is new:** booked back to available, used when a confirmed booking is cancelled.
   - **Every seat method takes an optional `session`:** pass it to your update, because seats and booking status commit together.
   - Seat methods return `false` instead of throwing when the guarded update matches nothing. [stub-flight-inventory.service.ts](../backend/src/modules/flight-bookings/stub/stub-flight-inventory.service.ts) shows the pattern.
2. In [flight-bookings.module.ts](../backend/src/modules/flight-bookings/flight-bookings.module.ts), import `FlightsModule` and change the provider to `{ provide: FLIGHT_INVENTORY, useExisting: FlightsService }`.
3. Remove `StubFlight` from that module, delete `flight-bookings/stub/`, and delete the `seed:stub-flights` script.
4. Update `test/flight-bookings.e2e.ts`, which creates its flights through the stub, then run `npm run test:bookings`.

Then call these from your flows (`FlightBookingsService` is exported):

| When | Call |
|---|---|
| FLT-06: a flight is cancelled | `cancelForFlight(flightId, reason)`: full refunds, holds expired, notifications sent. Run it again if `failed` is not empty. |
| FLT-05: flight times change | `applyScheduleChange(flightId)`, after saving the new times |
| FLT-29: moderator bookings view + CSV | `listForFlight(user, airlineId, flightId, query)` (passport and date of birth are removed) |

To avoid an import cycle (bookings already depends on flights), use `forwardRef` or `ModuleRef` for these calls.

Agree on `cabinClass` values: the stub uses `economy` and `business`, and bookings accept any string your flight offers.

## 2. Person 4: paying for hotels

1. Import `PaymentsModule`.
2. Implement `BookingConfirmationHandler` ([interface](../backend/src/modules/payments/booking-confirmation-handler.interface.ts)) and register it in `onModuleInit`: `this.payments.registerHandler(BookingType.Hotel, this)`.
3. `onPaymentSucceeded` must be idempotent, and return `false` when the hold was lost: the customer is then refunded automatically.
4. To expire a hold, call `payments.cancelOpenIntent(BookingType.Hotel, id)`.
5. To cancel, inside your transaction call `queueRefund(BookingType.Hotel, id, amountMinor, reason, session)`. After the commit call `sendQueuedRefunds(result)`.

`cancelConfirmed` in [flight-bookings.service.ts](../backend/src/modules/flight-bookings/flight-bookings.service.ts) is a working example of step 5. `BookingStatus` and `canTransition` are shared.

## 3. Person 6: admin bookings

`FlightBookingsService.listAllForAdmin(query)` backs ACC-17. Import `FlightBookingsModule`.

## Trying it without a frontend

```bash
npm run seed:stub-flights     # prints flight ids
npm run start:dev
```

1. In Swagger, log in as a traveller and call `POST /flight-bookings` with one of the printed ids.
2. Call `POST /payments/intent` with `acceptPolicies: true`.
3. Call `POST /payments/{id}/test-confirm`, which pays with a Stripe test card. Use `pm_card_chargeDeclined` to test a failure and retry. This needs an `sk_test_` key, and is switched off in production.

`test-confirm` applies the result itself, so no webhook setup is needed for a demo. To exercise the real webhook, run `stripe listen --forward-to localhost:4000/api/payments/webhook` and put the printed secret in `STRIPE_WEBHOOK_SECRET`. Subscribe to `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `refund.updated`, `refund.failed` and `charge.refund.updated`.

## Rules assumed

The requirements text was not in the repo when this was written. Check these against the official wording:

| Rule | Implemented as |
|---|---|
| Passengers per booking | 1 to 9, at least one adult |
| Infants | No seat, at most one per adult |
| Passenger type | By age at departure: infant under 2, child 2 to 11, adult 12+ |
| Passenger details | Name in Latin letters, date of birth, nationality, passport number |
| Who can book | Traveller accounts only |
| Round-trip | One booking with two legs, cancelled as a whole |
| Cancelling | Confirmed bookings only, before the first departure |
| Refund amount | Each leg uses its own tiers and days remaining |
| Pending booking | Traveller cannot cancel it (GEN-11 has no such transition); it expires |
| Payment after the hold expired | Confirmed if the seats are still held, otherwise fully refunded |
| Extra bags | Per passenger, per flight |
