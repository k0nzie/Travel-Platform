# Flight booking and payments (Person 3): integration guide

Covers FLT-12 (booking rules), FLT-19, 21, 22, 23, 25, 26, GEN-11, PAY-01 to PAY-04.

## Booking flow

| Step | Endpoint | Requirement |
|---|---|---|
| Passengers + baggage, price summary (nothing held) | `POST /api/flight-bookings` | FLT-19, FLT-21 |
| Hold seats for 10 minutes | `POST /api/flight-bookings/hold` | FLT-22 |
| See amount and policies | `GET /api/bookings/flight/:id/policies` | PAY-02 |
| Accept policies (stored with a timestamp) | `POST /api/bookings/flight/:id/accept-policies` | PAY-02 |
| Start payment | `POST /api/payments` | PAY-01 |
| Retry a failed payment | `POST /api/payments/:id/retry` | PAY-01 |
| Payment confirmed | Stripe webhook, or `POST /api/payments/:id/sync` | PAY-01, FLT-23 |
| Payment / refund status | `GET /api/payments/:id`, `GET /api/refunds/:id` | PAY-03 |
| Download ticket | `GET /api/flight-bookings/:id/e-ticket` | FLT-23 |
| My bookings | `GET /api/flight-bookings?scope=upcoming\|past\|cancelled`, `GET /api/flight-bookings/:id` | FLT-25 |
| Refund preview, then cancel | `GET /api/flight-bookings/:id/cancellation-preview`, `POST /api/flight-bookings/:id/cancel` | FLT-26 |

All booking money is stored as integer minor units (cents) in the platform currency.
Flights store prices in major units; the adapter converts.

MongoDB must be a replica set, because bookings use transactions. Atlas already is one;
a plain local `mongod` is not.

## 1. How flights and bookings connect

The bookings module owns the `flight_bookings` collection. The flights module never reads
or writes booking documents.

```
FlightBookingsModule ──imports──▶ FlightsModule
   FlightsInventoryAdapter ──▶ FlightsService (getForBooking, reserveSeats, releaseSeats,
                                               convertHeldToBooked, releaseBookedSeats)
   FlightBookingsService ──registers bridge──▶ FlightHooksService
FlightsService ──calls bridge──▶ countForFlight / listForFlight / exportForFlight /
                                 onFlightCancelled / onScheduleChanged
```

- **Inventory.** Bookings use only `FlightInventoryPort`. `adapters/flights-inventory.adapter.ts`
  maps Person 2's documents onto it: fares in cents, child = cabin fare, infant = 10% (FLT-12),
  the chosen cabin's baggage allowance plus the airline's extra-bag rules (FLT-04, FLT-08),
  and the airline's `{ minDays, refundPercent }` tiers (FLT-09). Every seat move takes the
  booking's transaction `session`, so seat counters and booking status commit together.
- **FLT-06.** `FlightsService.cancelFlight` marks the flight Cancelled, then calls
  `onFlightCancelled`: holds expire, confirmed bookings are cancelled with a 100% refund and
  their seats released on every leg, and passengers are notified. If a refund cannot start,
  the endpoint answers 503 and repeating the cancel retries only the unfinished bookings.
- **FLT-05.** After a time change, `onScheduleChanged` refreshes the booking copies and
  notifies passengers with Confirmed bookings. Airports are locked once `countForFlight > 0`.
- **FLT-29.** `listForFlight` / `exportForFlight` return reference, passenger names, cabin,
  seats and status for Confirmed, Completed and Cancelled bookings. Moderator scope is
  checked in FlightsService before the bridge is called.
- **Late payment on a cancelled flight.** If seats can no longer be issued when the payment
  succeeds, the booking expires and the customer is refunded in full.

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
npm run seed            # reference data + admin
npm run seed:flights    # Person 2 sample airlines and flights (CAI <-> LHR)
npm run start:dev
```

1. In Swagger, log in as a traveller and call `POST /flight-bookings/hold` with a flight id
   from `GET /flights/search` and `cabinClass: "Economy"`.
2. Call `POST /bookings/flight/{id}/accept-policies` with `{ "accept": true }`, then `POST /payments`.
3. Call `POST /payments/{id}/test-confirm`, which pays with a Stripe test card. Use
   `pm_card_chargeDeclined` to test a failure, then `POST /payments/{id}/retry`. This needs an
   `sk_test_` key, and is switched off in production.

`test-confirm` applies the result itself, so no webhook setup is needed for a demo. To exercise the real webhook, run `stripe listen --forward-to localhost:4000/api/payments/webhook` and put the printed secret in `STRIPE_WEBHOOK_SECRET`. Subscribe to `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `refund.updated`, `refund.failed` and `charge.refund.updated`.

## Rules assumed

Checked against the official requirements sheet:

| Rule | Implemented as |
|---|---|
| Passengers per booking | 1 to 9, at least one adult |
| Infants | No seat, at most one per adult |
| Passenger type | By age at departure: infant under 2, child 2 to 11, adult 12+ |
| Passenger details | Name in Latin letters, date of birth, nationality, passport number |
| Who can book | Traveller accounts only |
| Round-trip | One booking with two legs, one payment and one reference, cancelled as a whole |
| Cancelling | Confirmed bookings only, before the first departure |
| Refund amount | FLT-12a: the outbound segment's tier, on the full amount paid |
| Pending booking | Traveller cannot cancel it (GEN-11 has no such transition); it expires |
| Payment after the hold expired | Confirmed if the seats are still held, otherwise fully refunded |
| Fares | Adults and children pay the cabin fare; infants 10% (FLT-12b) |
| Extra bags | Per passenger, per flight, up to the airline maximum; same max weight as free bags |
