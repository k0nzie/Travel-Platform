import { BookingStatus } from '../../common/constants/enums';

/** UTC date-only convention shared with the hotel's existing booking and search APIs. */
export function canReviewHotelBooking(status: BookingStatus, checkOut: string, now = new Date()): boolean {
  const today = now.toISOString().slice(0, 10);
  return status === BookingStatus.Completed || (status === BookingStatus.Confirmed && checkOut < today);
}

/** Keep the displayed average stable to two decimal places. */
export function hotelRatingAggregate(ratings: readonly number[]) {
  const ratingsCount = ratings.length;
  const averageRating = ratingsCount ? Math.round((ratings.reduce((sum, n) => sum + n, 0) / ratingsCount) * 100) / 100 : 0;
  return { averageRating, ratingsCount };
}
