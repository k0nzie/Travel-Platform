import { BookingStatus } from '../../common/constants/enums';

export type ReservationLock = {
  bookingId: unknown;
  startDate: string;
  endDate: string;
  status: BookingStatus.PendingPayment | BookingStatus.Confirmed;
  expiresAt: Date;
};

/** Both dates are date-only strings; [start, end) uses exclusive checkout. */
export function hasLiveRoomReservation(
  locks: readonly ReservationLock[] | undefined,
  startDate: string,
  endDate: string,
  now = new Date(),
): boolean {
  return (locks ?? []).some(
    (lock) =>
      lock.startDate < endDate &&
      lock.endDate > startDate &&
      (lock.status === BookingStatus.Confirmed ||
        (lock.status === BookingStatus.PendingPayment && lock.expiresAt > now)),
  );
}

/** A single $elemMatch is vital: the same lock must satisfy both date predicates. */
export function liveRoomReservationMatch(startDate: string, endDate: string, now = new Date()) {
  return {
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
    $or: [{ status: BookingStatus.Confirmed }, { status: BookingStatus.PendingPayment, expiresAt: { $gt: now } }],
  };
}

export function anyLiveRoomReservationMatch(now = new Date()) {
  return {
    endDate: { $gt: now.toISOString().slice(0, 10) },
    $or: [{ status: BookingStatus.Confirmed }, { status: BookingStatus.PendingPayment, expiresAt: { $gt: now } }],
  };
}
