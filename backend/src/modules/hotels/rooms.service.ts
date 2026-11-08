import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { ProviderType } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertModerates } from '../../common/utils/access.util';
import { parseDateOnly } from '../../common/utils/time.util';

import { CreateRoomAvailabilityDto, CreateRoomDto, UpdateRoomDto, UpdateRoomAvailabilityDto } from './dto/rooms.dto';

import { Hotel, HotelDocument } from './schemas/hotel.schema';
import { Room, RoomDocument } from './schemas/room.schema';

@Injectable()
export class RoomsService {
  constructor(
    @InjectModel(Room.name)
    private readonly rooms: Model<RoomDocument>,

    @InjectModel(Hotel.name)
    private readonly hotels: Model<HotelDocument>,
  ) {}

  /**
   * HTL-03: Create a room in the assigned hotel.
   */
  async createRoom(user: AuthUser, hotelId: string, dto: CreateRoomDto) {
    assertModerates(user, ProviderType.Hotel, hotelId);

    const hotel = await this.hotels.findById(hotelId).exec();

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    const roomLabel = dto.roomLabel.trim().replace(/\s+/g, ' ');

    const roomKey = roomLabel.toLowerCase();

    const roomType = dto.roomType.trim().replace(/\s+/g, ' ');

    const existing = await this.rooms
      .exists({
        hotelId: new Types.ObjectId(hotelId),
        roomKey,
      })
      .exec();

    if (existing) {
      throw new ConflictException({
        message: 'Room number or name already exists in this hotel',
        code: 'ROOM_ALREADY_EXISTS',
      });
    }

    let room: RoomDocument;

    try {
      room = await this.rooms.create({
        hotelId: new Types.ObjectId(hotelId),
        roomLabel,
        roomKey,
        roomType,
        beds: dto.beds,
        maxOccupancy: dto.maxOccupancy,
        pricePerNightMinor: dto.pricePerNightMinor,
      });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        throw new ConflictException({
          message: 'Room number or name already exists in this hotel',
          code: 'ROOM_ALREADY_EXISTS',
        });
      }

      throw error;
    }

    return {
      id: String(room._id),
      hotelId: String(room.hotelId),
      roomLabel: room.roomLabel,
      roomType: room.roomType,
      beds: room.beds,
      maxOccupancy: room.maxOccupancy,
      pricePerNightMinor: room.pricePerNightMinor,
      status: room.status,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  /**
   * HTL-04: Add a non-overlapping bookable date range.
   *
   * startDate is inclusive.
   * endDate is exclusive.
   */
  async addAvailability(user: AuthUser, hotelId: string, roomId: string, dto: CreateRoomAvailabilityDto) {
    // Step 1: Moderator must be assigned to this hotel.
    assertModerates(user, ProviderType.Hotel, hotelId);

    // Step 2: Validate actual calendar dates.
    const start = parseDateOnly(dto.startDate);
    const end = parseDateOnly(dto.endDate);

    if (
      start.toISOString().slice(0, 10) !== dto.startDate ||
      end.toISOString().slice(0, 10) !== dto.endDate ||
      start.getTime() >= end.getTime()
    ) {
      throw new BadRequestException({
        message: 'endDate must be after startDate',
        code: 'INVALID_DATE_RANGE',
      });
    }

    // Step 3: Atomically append the range only if
    // no existing availability range overlaps it.
    //
    // Two half-open ranges overlap when:
    // existing.startDate < new.endDate AND
    // existing.endDate > new.startDate.
    //
    // YYYY-MM-DD strings can be compared directly
    // because their format is fixed and validated.
    const updated = await this.rooms
      .findOneAndUpdate(
        {
          _id: roomId,
          hotelId: new Types.ObjectId(hotelId),
          availabilityRanges: {
            $not: {
              $elemMatch: {
                startDate: { $lt: dto.endDate },
                endDate: { $gt: dto.startDate },
              },
            },
          },
        },
        {
          $push: {
            availabilityRanges: {
              startDate: dto.startDate,
              endDate: dto.endDate,
            },
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    // Step 4: Distinguish missing room from overlap.
    if (!updated) {
      const roomExists = await this.rooms
        .exists({
          _id: roomId,
          hotelId: new Types.ObjectId(hotelId),
        })
        .exec();

      if (!roomExists) {
        throw new NotFoundException('Room not found in this hotel');
      }

      throw new ConflictException({
        message: 'Availability range overlaps an existing range',
        code: 'AVAILABILITY_OVERLAP',
      });
    }

    // Step 5: Return the room's availability schedule.
    return {
      roomId: String(updated._id),
      hotelId: String(updated.hotelId),
      availabilityRanges: updated.availabilityRanges
        .map((range) => ({
          startDate: range.startDate,
          endDate: range.endDate,
        }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    };
  }

  /**
   * HTL-05: Edit the details of a room belonging
   * to the assigned hotel.
   */
  async updateRoom(user: AuthUser, hotelId: string, roomId: string, dto: UpdateRoomDto) {
    // Step 1: Authorize the moderator.
    assertModerates(user, ProviderType.Hotel, hotelId);

    // Step 2: Only update fields explicitly provided.
    const changes: Partial<Pick<Room, 'beds' | 'maxOccupancy' | 'pricePerNightMinor'>> = {};

    if (dto.beds !== undefined) {
      changes.beds = dto.beds;
    }

    if (dto.maxOccupancy !== undefined) {
      changes.maxOccupancy = dto.maxOccupancy;
    }

    if (dto.pricePerNightMinor !== undefined) {
      changes.pricePerNightMinor = dto.pricePerNightMinor;
    }

    // Step 3: Reject empty updates.
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException({
        message: 'At least one room field must be provided',
        code: 'EMPTY_ROOM_UPDATE',
      });
    }

    // Step 4: Update only a room from this hotel.
    const updated = await this.rooms
      .findOneAndUpdate(
        {
          _id: roomId,
          hotelId: new Types.ObjectId(hotelId),
        },
        {
          $set: changes,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Room not found in this hotel');
    }

    // Step 5: Return the updated room.
    return {
      id: String(updated._id),
      hotelId: String(updated.hotelId),
      roomLabel: updated.roomLabel,
      roomType: updated.roomType,
      beds: updated.beds,
      maxOccupancy: updated.maxOccupancy,
      pricePerNightMinor: updated.pricePerNightMinor,
      status: updated.status,
      availabilityRanges: updated.availabilityRanges,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * HTL-05: Replace an existing availability range.
   *
   * Uses an optimistic concurrency guard to prevent
   * simultaneous schedule edits from overwriting each other.
   */
  async updateAvailability(user: AuthUser, hotelId: string, roomId: string, dto: UpdateRoomAvailabilityDto) {
    assertModerates(user, ProviderType.Hotel, hotelId);

    // Validate both the original and replacement periods.
    const periods = [
      {
        startDate: dto.originalStartDate,
        endDate: dto.originalEndDate,
      },
      {
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    ];

    for (const period of periods) {
      const start = parseDateOnly(period.startDate);
      const end = parseDateOnly(period.endDate);

      if (
        start.toISOString().slice(0, 10) !== period.startDate ||
        end.toISOString().slice(0, 10) !== period.endDate ||
        start.getTime() >= end.getTime()
      ) {
        throw new BadRequestException({
          message: 'Invalid availability date range',
          code: 'INVALID_DATE_RANGE',
        });
      }
    }

    const hotelObjectId = new Types.ObjectId(hotelId);

    // Read the current schedule.
    const room = await this.rooms
      .findOne({
        _id: roomId,
        hotelId: hotelObjectId,
      })
      .exec();

    if (!room) {
      throw new NotFoundException('Room not found in this hotel');
    }

    const originalRanges = (room.availabilityRanges ?? []).map((range) => ({
      startDate: range.startDate,
      endDate: range.endDate,
    }));

    // Find the exact period to replace.
    const targetIndex = originalRanges.findIndex(
      (range) => range.startDate === dto.originalStartDate && range.endDate === dto.originalEndDate,
    );

    if (targetIndex === -1) {
      throw new NotFoundException({
        message: 'Original availability range not found',
        code: 'AVAILABILITY_RANGE_NOT_FOUND',
      });
    }

    const replacement = {
      startDate: dto.startDate,
      endDate: dto.endDate,
    };

    // Ensure the replacement doesn't overlap any OTHER range.
    const overlaps = originalRanges.some(
      (range, index) =>
        index !== targetIndex && range.startDate < replacement.endDate && range.endDate > replacement.startDate,
    );

    if (overlaps) {
      throw new ConflictException({
        message: 'Updated availability overlaps an existing range',
        code: 'AVAILABILITY_OVERLAP',
      });
    }

    const newRanges = [...originalRanges];
    newRanges[targetIndex] = replacement;

    newRanges.sort((a, b) => a.startDate.localeCompare(b.startDate));

    // Compare the entire previous schedule in the filter.
    // If another request changed it since our read, the
    // update will not match, preventing a lost update.
    const updated = await this.rooms
      .findOneAndUpdate(
        {
          _id: roomId,
          hotelId: hotelObjectId,
          availabilityRanges: originalRanges,
        },
        {
          $set: {
            availabilityRanges: newRanges,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!updated) {
      throw new ConflictException({
        message: 'Availability changed during editing. Please retry.',
        code: 'AVAILABILITY_CHANGED_RETRY',
      });
    }

    return {
      roomId: String(updated._id),
      hotelId: String(updated.hotelId),
      availabilityRanges: updated.availabilityRanges.map((range) => ({
        startDate: range.startDate,
        endDate: range.endDate,
      })),
    };
  }
}
