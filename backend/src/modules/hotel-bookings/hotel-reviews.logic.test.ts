import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BookingStatus } from '../../common/constants/enums';
import { canReviewHotelBooking, hotelRatingAggregate } from './hotel-reviews.logic';

test('HTL-23: only a completed stay (after checkout date) is reviewable', () => {
  const now = new Date('2027-03-20T12:00:00Z');
  assert.equal(canReviewHotelBooking(BookingStatus.Confirmed, '2027-03-19', now), true);
  assert.equal(canReviewHotelBooking(BookingStatus.Confirmed, '2027-03-20', now), false);
  assert.equal(canReviewHotelBooking(BookingStatus.Confirmed, '2027-03-21', now), false);
  assert.equal(canReviewHotelBooking(BookingStatus.Completed, '2027-03-19', now), true);
  assert.equal(canReviewHotelBooking(BookingStatus.Cancelled, '2027-03-01', now), false);
  assert.equal(canReviewHotelBooking(BookingStatus.Expired, '2027-03-01', now), false);
});

test('HTL-23/24: average and count after create, edit or deletion', () => {
  assert.deepEqual(hotelRatingAggregate([]), { averageRating: 0, ratingsCount: 0 });
  assert.deepEqual(hotelRatingAggregate([5]), { averageRating: 5, ratingsCount: 1 });
  assert.deepEqual(hotelRatingAggregate([5, 4, 3]), { averageRating: 4, ratingsCount: 3 });
  assert.deepEqual(hotelRatingAggregate([5, 5, 4]), { averageRating: 4.67, ratingsCount: 3 });
});
