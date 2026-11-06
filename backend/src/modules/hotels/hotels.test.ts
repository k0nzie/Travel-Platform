import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HotelsService } from './hotels.service';
import { CreateHotelDto } from './dto/hotels.dto';
import { buildValidationPipe } from '../../common/pipes/validation';

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
  };

  const hotelModel: any = {
    create: async (data: any) => {
      calls.push(['create', data]);
      return { _id: hotelId, ...data };
    },

    findById: (id: string) => queryResult(id === hotelId ? hotel : null),

    findByIdAndUpdate: (id: string, update: any, options: any) => {
      calls.push(['update', id, update, options]);
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

  return { service, calls };
}

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

  assert.equal(createCall[1].cityName, 'Cairo');
  assert.equal(createCall[1].countryCode, 'EG');

  assert.ok(calls.some((c) => c[0] === 'audit'));
});

test('HTL-01: Moderator cannot edit another hotel', async () => {
  const { service, calls } = fixture();

  await assert.rejects(service.updateHotel(moderator, otherHotelId, { name: 'Unauthorized edit' }), /assigned hotel/);

  assert.equal(calls.length, 0);
});

test('HTL-01: Assigned moderator can edit hotel', async () => {
  const { service, calls } = fixture();

  const updated = await service.updateHotel(moderator, hotelId, { name: 'Updated Nile Palace' });

  assert.equal(updated.name, 'Updated Nile Palace');

  const updateCall = calls.find((c) => c[0] === 'update');

  assert.equal(updateCall[2].$set.name, 'Updated Nile Palace');

  assert.equal(updateCall[3].runValidators, true);
});

test('HTL-02: Hotel details include photos', async () => {
  const { service, calls } = fixture();

  const result = await service.findHotel(hotelId);

  assert.equal(result.name, 'Nile Palace Hotel');
  assert.deepEqual(result.photos, []);

  assert.ok(calls.some((c) => c[0] === 'listImages'));
});

test('HTL-02: Unknown hotel returns an error', async () => {
  const { service } = fixture();

  await assert.rejects(service.findHotel(otherHotelId), /Hotel not found/);
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
