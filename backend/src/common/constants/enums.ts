export enum Role {
  User = 'user',
  Admin = 'admin',
  AirlineModerator = 'airline_moderator',
  HotelModerator = 'hotel_moderator',
}

export enum AccountStatus {
  Active = 'active',
  Suspended = 'suspended', // set by an admin (ACC-15, ACC-16)
  Deactivated = 'deactivated', // set by the user themself (ACC-12)
}

export enum ProviderType {
  Airline = 'airline',
  Hotel = 'hotel',
}

/** GEN-11: shared lifecycle for flight bookings and hotel reservations. */
export enum BookingStatus {
  PendingPayment = 'pending_payment',
  Confirmed = 'confirmed',
  Completed = 'completed',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

/** Allowed transitions for GEN-11. Use `canTransition()` before changing a booking status. */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PendingPayment]: [BookingStatus.Confirmed, BookingStatus.Expired],
  [BookingStatus.Confirmed]: [BookingStatus.Completed, BookingStatus.Cancelled],
  [BookingStatus.Completed]: [],
  [BookingStatus.Expired]: [],
  [BookingStatus.Cancelled]: [],
};

export const canTransition = (from: BookingStatus, to: BookingStatus) =>
  BOOKING_TRANSITIONS[from]?.includes(to) ?? false;

/** Where each role lands after login (ACC-04). The frontend maps these to routes. */
export const ROLE_HOME: Record<Role, string> = {
  [Role.User]: '/',
  [Role.Admin]: '/admin',
  [Role.AirlineModerator]: '/moderator/airline',
  [Role.HotelModerator]: '/moderator/hotel',
};

/** ACC-01 password rule: 8+ chars with at least one letter and one digit. */
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;
export const PASSWORD_RULE_MESSAGE =
  'Password must be at least 8 characters and include at least one letter and one digit';

export const DEFAULT_PAGE_SIZE = 10; // GEN-05
export const MAX_PAGE_SIZE = 100;
