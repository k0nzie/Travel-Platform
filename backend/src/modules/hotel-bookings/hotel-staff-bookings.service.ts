import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BookingStatus, ProviderType } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertModerates } from '../../common/utils/access.util';
import { paginate } from '../../common/utils/paginate';
import { HotelStaffBookingsQueryDto } from './dto/hotel-staff-bookings.dto';
import { HotelBooking, HotelBookingDocument } from './schemas/hotel-booking.schema';

/** HTL-22: Hotel staff can inspect reservations for their assigned hotel only. */
@Injectable()
export class HotelStaffBookingsService {
  constructor(@InjectModel(HotelBooking.name) private readonly bookings: Model<HotelBookingDocument>) {}

  async listForHotel(user: AuthUser, hotelId: string, query: HotelStaffBookingsQueryDto) {
    assertModerates(user, ProviderType.Hotel, hotelId);

    const filter: Record<string, unknown> = { hotelId: new Types.ObjectId(hotelId) };
    if (query.status) filter.status = query.status;

    const result = await paginate(this.bookings, filter, {
      page: query.page,
      limit: query.limit,
      sort: { checkIn: -1, _id: -1 },
      populate: { path: 'userId', select: 'name email status' },
    });

    return {
      ...result,
      items: result.items.map((booking: any) => {
        const populated = booking.userId && typeof booking.userId === 'object' && 'name' in booking.userId;
        const guest = populated
          ? { id: String(booking.userId._id), name: booking.userId.name, email: booking.userId.email }
          : { id: String(booking.userId), name: null, email: null };

        return {
          id: String(booking._id),
          reference: booking.reference,
          hotelId: String(booking.hotelId),
          hotelName: booking.hotelName,
          guest,
          guestCount: booking.guestCount,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          status: booking.status as BookingStatus,
          rooms: (booking.rooms ?? []).map((room: any) => ({
            roomId: String(room.roomId),
            roomLabel: room.roomLabel,
            roomType: room.roomType,
            adults: room.adults,
            childrenAges: room.childrenAges,
          })),
          totalMinor: booking.totalMinor,
          currency: booking.currency,
          createdAt: booking.createdAt,
        };
      }),
    };
  }
}
