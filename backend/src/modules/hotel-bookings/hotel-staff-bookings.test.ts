import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { BookingStatus, ProviderType, Role } from '../../common/constants/enums';
import { ROLES_KEY } from '../../common/decorators';
import { HotelStaffBookingsController } from './hotel-staff-bookings.controller';
import { HotelStaffBookingsService } from './hotel-staff-bookings.service';

const hotelId = '507f1f77bcf86cd799439011';
const moderator: any = {
  id: '507f1f77bcf86cd799439099', role: Role.HotelModerator,
  moderatorAssignment: { providerType: ProviderType.Hotel, providerId: hotelId },
};

test('HTL-22: only assigned moderator may read a hotel reservation list', async () => {
  const service = new HotelStaffBookingsService({} as any);
  await assert.rejects(service.listForHotel({ ...moderator, role: Role.User }, hotelId, {}),
    (error: any) => error.getStatus() === 403);
  await assert.rejects(service.listForHotel({ ...moderator, moderatorAssignment: {
    providerType: ProviderType.Hotel, providerId: '507f1f77bcf86cd799439010',
  } }, hotelId, {}), (error: any) => error.getStatus() === 403);
});

test('HTL-22: moderator route is GET and protected', () => {
  const handler = HotelStaffBookingsController.prototype.list;
  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'hotel/:hotelId');
  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.GET);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [Role.HotelModerator]);
  assert.equal(BookingStatus.Confirmed, 'confirmed');
});
