import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ProviderType, Role } from '../constants/enums';
import { AuthUser } from '../interfaces/auth-user.interface';

type Id = string | Types.ObjectId | { _id: Types.ObjectId } | null | undefined;

/** Normalises ObjectId / populated doc / string to a plain string id. */
export const idOf = (value: Id): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toHexString();
  if ((value as any)._id) return String((value as any)._id);
  return String(value);
};

export const sameId = (a: Id, b: Id) => !!a && !!b && idOf(a) === idOf(b);

/**
 * ACC-11: owner-only access. Throws 404 (not 403) so a stranger can't tell
 * whether someone else's booking/itinerary exists.
 *
 *   assertOwner(booking.userId, user, { allowAdmin: true, resource: 'Booking' });
 */
export function assertOwner(
  ownerId: Id,
  user: AuthUser | undefined,
  opts: { allowAdmin?: boolean; resource?: string } = {},
) {
  if (user && opts.allowAdmin && user.role === Role.Admin) return;
  if (!user || !sameId(ownerId, user.id)) {
    throw new NotFoundException(`${opts.resource ?? 'Resource'} not found`);
  }
}

/** True when the user is the moderator assigned to this airline / hotel. */
export function moderates(user: AuthUser | undefined, providerType: ProviderType, providerId: Id) {
  const expectedRole = providerType === ProviderType.Airline ? Role.AirlineModerator : Role.HotelModerator;
  return (
    !!user &&
    user.role === expectedRole &&
    user.moderatorAssignment?.providerType === providerType &&
    sameId(user.moderatorAssignment.providerId, providerId)
  );
}

/**
 * Moderators may manage only their assigned provider.
 *
 *   assertModerates(user, ProviderType.Hotel, hotelId);                 // moderator only
 *   assertModerates(user, ProviderType.Hotel, hotelId, { allowAdmin: true });
 */
export function assertModerates(
  user: AuthUser | undefined,
  providerType: ProviderType,
  providerId: Id,
  opts: { allowAdmin?: boolean } = {},
) {
  if (opts.allowAdmin && user?.role === Role.Admin) return;
  if (!moderates(user, providerType, providerId)) {
    throw new ForbiddenException(`You can only manage your assigned ${providerType}`);
  }
}
