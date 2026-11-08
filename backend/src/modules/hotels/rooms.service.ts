import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { ProviderType } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertModerates } from '../../common/utils/access.util';
import { parseDateOnly } from '../../common/utils/time.util';

import { CreateRoomAvailabilityDto, CreateRoomDto } from './dto/rooms.dto';

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
}
