import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Role } from '../../common/constants/enums';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../../common/decorators';
import { buildValidationPipe } from '../../common/pipes/validation';
import { CreateHotelReviewDto } from './dto/hotel-review.dto';
import { HotelRoomStatusQueryDto } from './dto/hotel-room-management.dto';
import { HotelReviewsController, PublicHotelReviewsController } from './hotel-reviews.controller';
import { HotelRoomManagementController } from './hotel-room-management.controller';
import { HotelReviewSchema } from './schemas/hotel-review.schema';

function checkRoute(handler: (...args: any[]) => any, path: string, method: RequestMethod, role?: Role) {
  const actualPath = Reflect.getMetadata(PATH_METADATA, handler);
  if (path === '') assert.ok(actualPath === '' || actualPath === '/');
  else assert.equal(actualPath, path);
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), method);
  if (role) assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [role]);
}

test('HTL-06/08/23/24: route paths and role boundaries are explicit', () => {
  checkRoute(HotelRoomManagementController.prototype.status, ':hotelId/rooms/status', RequestMethod.GET,
    Role.HotelModerator);
  checkRoute(HotelRoomManagementController.prototype.delete, ':hotelId/rooms/:roomId', RequestMethod.DELETE,
    Role.HotelModerator);
  checkRoute(HotelReviewsController.prototype.create, '', RequestMethod.POST, Role.User);
  checkRoute(HotelReviewsController.prototype.update, ':id', RequestMethod.PATCH, Role.User);
  checkRoute(HotelReviewsController.prototype.delete, ':id', RequestMethod.DELETE, Role.User);
  checkRoute(PublicHotelReviewsController.prototype.list, ':hotelId/reviews', RequestMethod.GET);
  assert.equal(Reflect.getMetadata(IS_PUBLIC_KEY, PublicHotelReviewsController.prototype.list), true);
});

test('HTL-23: schema enforces one review per reservation and integer ratings', () => {
  assert.equal(HotelReviewSchema.path('bookingId').instance, 'ObjectId');
  assert.ok(HotelReviewSchema.path('bookingId').options.unique);
  assert.equal(HotelReviewSchema.path('rating').options.min, 1);
  assert.equal(HotelReviewSchema.path('rating').options.max, 5);
});

test('HTL-23/08: DTO validation rejects bad review data and incomplete date ranges', async () => {
  const pipe = buildValidationPipe();
  const body: any = { type: 'body', metatype: CreateHotelReviewDto };
  const valid = await pipe.transform({ bookingId: '507f1f77bcf86cd799439012', rating: 5, review: '' }, body);
  assert.equal(valid.rating, 5);
  for (const bad of [
    { bookingId: 'bad', rating: 5 },
    { bookingId: '507f1f77bcf86cd799439012', rating: 0 },
    { bookingId: '507f1f77bcf86cd799439012', rating: 6 },
    { bookingId: '507f1f77bcf86cd799439012', rating: 2.5 },
    { bookingId: '507f1f77bcf86cd799439012', rating: 4, review: 'x'.repeat(1001) },
  ]) await assert.rejects(pipe.transform(bad, body));
  const query: any = { type: 'query', metatype: HotelRoomStatusQueryDto };
  await assert.rejects(pipe.transform({ startDate: '2027-01-01' }, query));
  await assert.rejects(pipe.transform({ startDate: 'wrong', endDate: '2027-02-01' }, query));
});
