import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BookingStatus } from '../../common/constants/enums';
import { isScheduleAvailable } from './hotel-search.logic';
import { liveRoomReservationMatch } from './room-reservation.logic';
import { Hotel, HotelDocument } from './schemas/hotel.schema';
import { Room, RoomDocument, RoomStatus } from './schemas/room.schema';

/** Hotels module owns rooms: bookings must call this service, not inject RoomModel. */
@Injectable()
export class HotelInventoryService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotels: Model<HotelDocument>,
    @InjectModel(Room.name) private readonly rooms: Model<RoomDocument>,
  ) {}

  getHotel(hotelId: string, session?: ClientSession) {
    return this.hotels.findById(hotelId).session(session).lean().exec();
  }

  getRooms(hotelId: string, roomIds: string[], session?: ClientSession) {
    return this.rooms
      .find({ hotelId: new Types.ObjectId(hotelId), _id: { $in: roomIds.map((id) => new Types.ObjectId(id)) } })
      .session(session)
      .lean()
      .exec();
  }

  /** Atomically claims one room. The caller wraps ALL selected rooms and booking creation in ONE transaction. */
  async reserve(
    hotelId: string,
    roomId: string,
    bookingId: Types.ObjectId,
    checkIn: string,
    checkOut: string,
    expiresAt: Date,
    session: ClientSession,
  ): Promise<boolean> {
    const now = new Date();
    const updated = await this.rooms
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(roomId),
          hotelId: new Types.ObjectId(hotelId),
          status: RoomStatus.Active,
          blockedRanges: {
            $not: { $elemMatch: { startDate: { $lt: checkOut }, endDate: { $gt: checkIn } } },
          },
          reservationLocks: { $not: { $elemMatch: liveRoomReservationMatch(checkIn, checkOut, now) } },
        },
        {
          $push: {
            reservationLocks: {
              bookingId,
              startDate: checkIn,
              endDate: checkOut,
              status: BookingStatus.PendingPayment,
              expiresAt,
            },
          },
        },
        { new: true, session, runValidators: true },
      )
      .exec();
    return !!updated;
  }

  /** Transition the exact reservation lock from held to permanently confirmed, in the same payment transaction. */
  async confirm(roomId: Types.ObjectId, bookingId: Types.ObjectId, session: ClientSession): Promise<boolean> {
    const updated = await this.rooms
      .findOneAndUpdate(
        {
          _id: roomId,
          reservationLocks: { $elemMatch: { bookingId, status: BookingStatus.PendingPayment } },
        },
        { $set: { 'reservationLocks.$.status': BookingStatus.Confirmed } },
        { session, new: true },
      )
      .exec();
    return !!updated;
  }

  /** Release only this booking's lock; never touch another guest's overlapping hold. */
  async release(roomId: Types.ObjectId, bookingId: Types.ObjectId, session: ClientSession): Promise<void> {
    const result = await this.rooms
      .updateOne({ _id: roomId }, { $pull: { reservationLocks: { bookingId } } }, { session })
      .exec();
    if (result.modifiedCount !== 1) {
      throw new Error(`Reservation lock missing for room ${roomId} on booking ${bookingId}`);
    }
  }

  /** Shared by quote/hold. Mutating a room between the read and write triggers Mongo's transaction write conflict. */
  isScheduleAvailable(room: Room, checkIn: string, checkOut: string) {
    return room.status === RoomStatus.Active && isScheduleAvailable(room, checkIn, checkOut);
  }
}
