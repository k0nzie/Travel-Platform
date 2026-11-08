import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { ProviderType } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertModerates } from '../../common/utils/access.util';

import { CreateRoomDto } from './dto/rooms.dto';
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
   * HTL-03: The assigned hotel moderator creates a room.
   */
  async createRoom(user: AuthUser, hotelId: string, dto: CreateRoomDto) {
    // A moderator can manage only their assigned hotel.
    assertModerates(user, ProviderType.Hotel, hotelId);

    // The hotel must exist.
    const hotel = await this.hotels.findById(hotelId).exec();

    if (!hotel) {
      throw new NotFoundException('Hotel not found');
    }

    // Normalize labels to prevent duplicates such as
    // "Room 101", "room 101", and "Room   101".
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

    // The unique MongoDB index also protects against
    // simultaneous requests creating the same room.
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
}
