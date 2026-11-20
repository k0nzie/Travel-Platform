import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { Role } from '../../common/constants/enums';
import { ROLES_KEY } from '../../common/decorators';
import { buildValidationPipe } from '../../common/pipes/validation';
import { computeRefundPercent } from '../../common/utils/cancellation-tiers';

import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { CreateHotelDto } from './dto/hotels.dto';
import { PutHotelPoliciesDto } from './dto/hotel-policies.dto';

// --------------------------------------------------
// Shared test data
// --------------------------------------------------

const hotelId = '507f1f77bcf86cd799439011';
const otherHotelId = '507f1f77bcf86cd799439012';
const cityId = '507f1f77bcf86cd799439013';

const admin: any = {
  id: '507f1f77bcf86cd799439014',
  role: 'admin',
};

const moderator: any = {
  id: '507f1f77bcf86cd799439015',
  role: 'hotel_moderator',
  moderatorAssignment: {
    providerType: 'hotel',
    providerId: hotelId,
  },
};

const hotelInput = {
  name: 'Nile Palace Hotel',
  address: '15 Nile Street, Cairo',
  cityId,
  description: 'A hotel overlooking the Nile',
  starClass: 5,
  amenities: ['Wi-Fi', 'Parking'],
};

const policyInput = {
  checkInTime: '15:00',
  checkOutTime: '11:00',
  cancellationTiers: [
    { minDays: 7, refundPercent: 100 },
    { minDays: 2, refundPercent: 50 },
    { minDays: 0, refundPercent: 0 },
  ],
};

// --------------------------------------------------
// Mock database helpers
// --------------------------------------------------

function queryResult(value: any) {
  return {
    lean() {
      return this;
    },

    async exec() {
      return value;
    },
  };
}

function fixture() {
  const calls: any[] = [];

  const hotel = {
    _id: hotelId,
    ...hotelInput,
    cityName: 'Cairo',
    countryCode: 'EG',
    status: 'active',

    // HTL-09: Default hotel check-in/out times.
    checkInTime: '14:00',
    checkOutTime: '12:00',

    // HTL-10: Initially empty cancellation policy.
    cancellationTiers: [],
  };

  const hotelModel: any = {
    create: async (data: any) => {
      calls.push(['create', data]);

      return {
        _id: hotelId,
        ...data,
      };
    },

    findById: (id: string) => queryResult(id === hotelId ? hotel : null),

    findByIdAndUpdate: (id: string, update: any, options: any) => {
      calls.push(['update', id, update, options]);

      // Simulate a missing hotel correctly.
      if (id !== hotelId) {
        return queryResult(null);
      }

      return queryResult({
        ...hotel,
        ...update.$set,
      });
    },
  };

  const referenceData: any = {
    getCityById: async (id: string) => {
      calls.push(['city', id]);

      return {
        _id: id,
        name: 'Cairo',
        countryCode: 'EG',
      };
    },
  };

  const audit: any = {
    log: async (...args: any[]) => {
      calls.push(['audit', ...args]);
    },
  };

  const media: any = {
    list: async (...args: any[]) => {
      calls.push(['listImages', ...args]);
      return [];
    },

    saveImages: async (data: any) => {
      calls.push(['saveImages', data]);
      return [];
    },

    remove: async (...args: any[]) => {
      calls.push(['removeImage', ...args]);
      return { deleted: true };
    },
  };

  const service = new HotelsService(hotelModel, referenceData, audit, media);

  return {
    service,
    calls,
  };
}

// ==================================================
// HTL-01: Hotel management
// ==================================================

test('HTL-01: Only an admin can create hotels', async () => {
  const { service, calls } = fixture();

  await assert.rejects(service.createHotel(moderator, hotelInput), /Admin role required/);

  assert.equal(calls.length, 0);
});

test('HTL-01: Admin creation resolves city and records audit', async () => {
  const { service, calls } = fixture();

  const created = await service.createHotel(admin, hotelInput);

  assert.equal(created.name, 'Nile Palace Hotel');

  const createCall = calls.find((c) => c[0] === 'create');

  assert.ok(createCall);
  assert.equal(createCall[1].cityName, 'Cairo');
  assert.equal(createCall[1].countryCode, 'EG');

  assert.ok(calls.some((c) => c[0] === 'audit'));
});

test('HTL-01: Moderator cannot edit another hotel', async () => {
  const { service, calls } = fixture();

  await assert.rejects(
    service.updateHotel(moderator, otherHotelId, {
      name: 'Unauthorized edit',
    }),
    /assigned hotel/,
  );

  assert.equal(calls.length, 0);
});

test('HTL-01: Assigned moderator can edit hotel', async () => {
  const { service, calls } = fixture();

  const updated = await service.updateHotel(moderator, hotelId, { name: 'Updated Nile Palace' });

  assert.equal(updated.name, 'Updated Nile Palace');

  const updateCall = calls.find((c) => c[0] === 'update');

  assert.ok(updateCall);
  assert.equal(updateCall[2].$set.name, 'Updated Nile Palace');
  assert.equal(updateCall[3].runValidators, true);
});

test('HTL-01: Photo upload enforces hotel assignment', async () => {
  const { service, calls } = fixture();

  const files: any[] = [
    {
      originalname: 'hotel.jpg',
      mimetype: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      size: 3,
    },
  ];

  await assert.rejects(service.uploadImages(moderator, otherHotelId, files), /assigned hotel/);

  assert.equal(calls.length, 0);

  await service.uploadImages(moderator, hotelId, files);

  const uploadCall = calls.find((c) => c[0] === 'saveImages');

  assert.ok(uploadCall);
  assert.equal(uploadCall[1].ownerType, 'hotel');
  assert.equal(uploadCall[1].ownerId, hotelId);
});

test('HTL-01: Invalid hotel DTO is rejected', async () => {
  const pipe = buildValidationPipe();

  const metadata: any = {
    type: 'body',
    metatype: CreateHotelDto,
  };

  await assert.rejects(
    pipe.transform(
      {
        ...hotelInput,
        starClass: 8,
        cityId: 'Cairo',
        unexpected: 'not allowed',
      },
      metadata,
    ),
  );

  const valid = await pipe.transform(hotelInput, metadata);

  assert.equal(valid.name, 'Nile Palace Hotel');
});

// ==================================================
// HTL-02: Public hotel details
// ==================================================

test('HTL-02: Hotel details include photos and policies', async () => {
  const { service, calls } = fixture();

  const result = await service.findHotel(hotelId);

  assert.equal(result.name, 'Nile Palace Hotel');
  assert.deepEqual(result.photos, []);

  // Policy fields are available on public details.
  assert.equal(result.checkInTime, '14:00');
  assert.equal(result.checkOutTime, '12:00');
  assert.deepEqual(result.cancellationTiers, []);

  assert.ok(calls.some((c) => c[0] === 'listImages'));
});

test('HTL-02: Unknown hotel returns an error', async () => {
  const { service } = fixture();

  await assert.rejects(service.findHotel(otherHotelId), /Hotel not found/);
});

// ==================================================
// HTL-09 / HTL-10: Hotel policies
// ==================================================

test('HTL-09/10: Assigned moderator saves hotel policies', async () => {
  const { service, calls } = fixture();

  const result = await service.setPolicies(moderator, hotelId, policyInput);

  assert.equal(result.id, hotelId);
  assert.equal(result.checkInTime, '15:00');
  assert.equal(result.checkOutTime, '11:00');
  assert.equal(result.cancellationTiers.length, 3);

  const write = calls.find((c) => c[0] === 'update');

  assert.ok(write);
  assert.equal(write[1], hotelId);

  // Only the intended policy fields are updated.
  assert.deepEqual(Object.keys(write[2].$set).sort(), ['cancellationTiers', 'checkInTime', 'checkOutTime']);

  assert.equal(write[3].new, true);
  assert.equal(write[3].runValidators, true);
});

test('HTL-10: Cancellation tiers are sorted without changing input', async () => {
  const { service, calls } = fixture();

  // Deliberately unsorted input.
  const input = {
    ...policyInput,
    cancellationTiers: [
      { minDays: 7, refundPercent: 100 },
      { minDays: 0, refundPercent: 0 },
      { minDays: 2, refundPercent: 50 },
    ],
  };

  const originalOrder = input.cancellationTiers.map((tier) => tier.minDays);

  await service.setPolicies(moderator, hotelId, input);

  const write = calls.find((c) => c[0] === 'update');

  assert.ok(write);

  // Stored tiers must be sorted.
  assert.deepEqual(
    write[2].$set.cancellationTiers.map((tier: any) => tier.minDays),
    [0, 2, 7],
  );

  // Input must remain unchanged.
  assert.deepEqual(
    input.cancellationTiers.map((tier) => tier.minDays),
    originalOrder,
  );

  assert.deepEqual(originalOrder, [7, 0, 2]);
});

test('HTL-10: Duplicate cancellation thresholds are rejected', async () => {
  const { service, calls } = fixture();

  await assert.rejects(
    service.setPolicies(moderator, hotelId, {
      ...policyInput,
      cancellationTiers: [
        { minDays: 7, refundPercent: 100 },
        { minDays: 7, refundPercent: 50 },
      ],
    }),
    /Invalid cancellation tiers/,
  );

  // Validation must reject the request before writing.
  assert.equal(calls.length, 0);
});

test('HTL-10: Refund calculation selects the correct tier', () => {
  const tiers = [
    { minDays: 7, refundPercent: 100 },
    { minDays: 2, refundPercent: 50 },
  ];

  assert.equal(computeRefundPercent(tiers, 10), 100);
  assert.equal(computeRefundPercent(tiers, 7), 100);
  assert.equal(computeRefundPercent(tiers, 6), 50);
  assert.equal(computeRefundPercent(tiers, 2), 50);

  // No matching tier = no refund.
  assert.equal(computeRefundPercent(tiers, 1), 0);
  assert.equal(computeRefundPercent(tiers, 0), 0);
  assert.equal(computeRefundPercent(tiers, -1), 0);

  // No cancellation tiers means 0% refund.
  assert.equal(computeRefundPercent([], 10), 0);

  // Tier order must not affect calculation.
  assert.equal(computeRefundPercent([...tiers].reverse(), 7), 100);
});

test('HTL-09/10: Moderator cannot edit another hotel policy', async () => {
  const { service, calls } = fixture();

  await assert.rejects(service.setPolicies(moderator, otherHotelId, policyInput), /assigned hotel/);

  await assert.rejects(service.setPolicies(admin, hotelId, policyInput), /assigned hotel/);

  // No unauthorized database operations.
  assert.equal(calls.length, 0);
});

test('HTL-09/10: Unknown hotel returns 404', async () => {
  const { service } = fixture();

  // A moderator assigned to a hotel that no longer exists.
  const missingHotelModerator: any = {
    ...moderator,
    moderatorAssignment: {
      providerType: 'hotel',
      providerId: otherHotelId,
    },
  };

  await assert.rejects(service.setPolicies(missingHotelModerator, otherHotelId, policyInput), (error: any) => {
    assert.equal(error.getStatus(), 404);
    return true;
  });
});

test('HTL-09/10: DTO rejects invalid times and tiers', async () => {
  const pipe = buildValidationPipe();

  const metadata: any = {
    type: 'body',
    metatype: PutHotelPoliciesDto,
  };

  const invalidInputs = [
    // Invalid clock times.
    { ...policyInput, checkInTime: '25:00' },
    { ...policyInput, checkOutTime: '12:90' },
    { ...policyInput, checkInTime: '3:00' },

    // Missing or invalid required fields.
    { ...policyInput, checkInTime: null },
    { ...policyInput, checkOutTime: null },
    { ...policyInput, cancellationTiers: null },
    { ...policyInput, cancellationTiers: {} },

    // Negative threshold.
    {
      ...policyInput,
      cancellationTiers: [{ minDays: -1, refundPercent: 50 }],
    },

    // Threshold must be an integer.
    {
      ...policyInput,
      cancellationTiers: [{ minDays: 7.5, refundPercent: 50 }],
    },

    // Refund percent cannot exceed 100.
    {
      ...policyInput,
      cancellationTiers: [{ minDays: 7, refundPercent: 120 }],
    },

    // Refund percent cannot be negative.
    {
      ...policyInput,
      cancellationTiers: [{ minDays: 7, refundPercent: -10 }],
    },

    // Unknown nested fields must be rejected.
    {
      ...policyInput,
      cancellationTiers: [
        {
          minDays: 7,
          refundPercent: 50,
          extra: true,
        },
      ],
    },

    // More than 20 tiers.
    {
      ...policyInput,
      cancellationTiers: Array.from({ length: 21 }, (_, i) => ({
        minDays: i,
        refundPercent: 50,
      })),
    },

    // Unknown top-level fields.
    {
      ...policyInput,
      unexpected: 'no',
    },
  ];

  for (const input of invalidInputs) {
    await assert.rejects(pipe.transform(input, metadata));
  }

  const valid = await pipe.transform(policyInput, metadata);

  assert.equal(valid.checkInTime, '15:00');
  assert.equal(valid.checkOutTime, '11:00');
  assert.equal(valid.cancellationTiers.length, 3);

  // An empty tier list is valid.
  const emptyTiers = await pipe.transform(
    {
      checkInTime: '14:00',
      checkOutTime: '12:00',
      cancellationTiers: [],
    },
    metadata,
  );

  assert.deepEqual(emptyTiers.cancellationTiers, []);
});

test('HTL-09/10: PUT route requires hotel moderator', () => {
  const handler = HotelsController.prototype.setHotelPolicies;

  assert.equal(Reflect.getMetadata(PATH_METADATA, handler), ':id/policies');

  assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.PUT);

  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), [Role.HotelModerator]);
});
