import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { ProviderType } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertModerates } from '../../common/utils/access.util';
import { paginate } from '../../common/utils/paginate';
import { Room, RoomDocument } from '../hotels/schemas/room.schema';
import { HotelRoomStatusQueryDto } from './dto/hotel-room-management.dto';
import { calendarDays, roomStatusOnDate } from './hotel-room-status.logic';
import { HotelBooking, HotelBookingDocument } from './schemas/hotel-booking.schema';

@Injectable()
export class HotelRoomManagementService {
  constructor(
    @InjectModel(Room.name) private readonly rooms: Model<RoomDocument>,
    @InjectModel(HotelBooking.name) private readonly bookings: Model<HotelBookingDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  /** HTL-06: Only rooms with zero historical bookings/holds may be permanently deleted. */
  async deleteNeverReserved(user: AuthUser, hotelId: string, roomId: string) {
    assertModerates(user, ProviderType.Hotel, hotelId);
    return this.connection.transaction(async (session) => {
      const room = await this.rooms.findOne({ _id: roomId, hotelId: new Types.ObjectId(hotelId) }).session(session).exec();
      if (!room) throw new NotFoundException('Room not found in this hotel');
      const everReserved = await this.bookings.exists({ 'rooms.roomId': room._id }).session(session).exec();
      if (everReserved || (room.reservationLocks ?? []).length) {
        throw new ConflictException({
          message: 'Only rooms that have never been reserved can be deleted', code: 'ROOM_HAS_BOOKING_HISTORY',
        });
      }
      // A simultaneous hold writes to this Room document, so MongoDB's transaction write-conflict
      // prevents a booking from committing against a room deleted by this operation.
      const removed = await this.rooms.findOneAndDelete({
        _id: room._id,
        hotelId: new Types.ObjectId(hotelId),
        reservationLocks: { $size: 0 },
      }, { session }).exec();
      if (!removed) throw new ConflictException('Room changed while deleting; retry');
      return { deleted: true, roomId: String(removed._id), hotelId };
    });
  }

  /** HTL-08: Date-by-date, paginated room inventory with reservation references. */
  async statusCalendar(user: AuthUser, hotelId: string, query: HotelRoomStatusQueryDto) {
    assertModerates(user, ProviderType.Hotel, hotelId);
    const days = calendarDays(query.startDate, query.endDate);
    const page = await paginate(this.rooms, { hotelId: new Types.ObjectId(hotelId) }, {
      page: query.page, limit: query.limit, sort: { roomLabel: 1, _id: 1 },
    });
    const now = new Date();
    const ids = [...new Set(page.items.flatMap((room: any) =>
      (room.reservationLocks ?? [])
        .filter((lock: any) => lock.startDate < query.endDate && lock.endDate > query.startDate &&
          (lock.status === 'confirmed' || (lock.status === 'pending_payment' && new Date(lock.expiresAt) > now)))
        .map((lock: any) => String(lock.bookingId)),
    ))];
    const bookings = ids.length
      ? await this.bookings.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
        .select('_id reference').lean().exec()
      : [];
    const references = new Map(bookings.map((b) => [String(b._id), b.reference]));
    return {
      hotelId, startDate: query.startDate, endDate: query.endDate, ...page,
      items: page.items.map((room: any) => ({
        roomId: String(room._id), roomLabel: room.roomLabel, roomType: room.roomType,
        roomStatus: room.status,
        days: days.map((day) => roomStatusOnDate(room, day, references, now)),
      })),
    };
  }
}
