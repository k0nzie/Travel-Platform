import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { toPage, escapeRegex } from '../../common/utils/paginate';
import { AvailableHotelRoomsQueryDto, HotelSearchQueryDto, HotelSearchSort } from './dto/hotel-search.dto';
import { cheapestFeasibleRoomPrice, isScheduleAvailable, validateHotelStay } from './hotel-search.logic';
import { Hotel, HotelDocument, HotelStatus } from './schemas/hotel.schema';
import { Room, RoomDocument, RoomStatus } from './schemas/room.schema';
import { liveRoomReservationMatch } from './room-reservation.logic';

@Injectable()
export class HotelSearchService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotels: Model<HotelDocument>,
    @InjectModel(Room.name) private readonly rooms: Model<RoomDocument>,
  ) {}

  /** Query candidates in MongoDB, then check union coverage of adjacent availability ranges. */
  private findCandidateRooms(hotelIds: Types.ObjectId[], checkIn: string, checkOut: string) {
    return this.rooms
      .find({
        hotelId: { $in: hotelIds },
        status: RoomStatus.Active,
        availabilityRanges: {
          $elemMatch: { startDate: { $lte: checkIn }, endDate: { $gt: checkIn } },
        },
        blockedRanges: {
          $not: { $elemMatch: { startDate: { $lt: checkOut }, endDate: { $gt: checkIn } } },
        },
        reservationLocks: { $not: { $elemMatch: liveRoomReservationMatch(checkIn, checkOut) } },
      })
      .lean()
      .exec();
  }

  /** HTL-11/12: Only active hotels with a feasible, unblocked set of rooms. */
  async searchHotels(q: HotelSearchQueryDto) {
    const nights = validateHotelStay(q.checkIn, q.checkOut);
    if (
      q.minPricePerNightMinor !== undefined &&
      q.maxPricePerNightMinor !== undefined &&
      q.minPricePerNightMinor > q.maxPricePerNightMinor
    ) {
      throw new BadRequestException('minPricePerNightMinor cannot exceed maxPricePerNightMinor');
    }
    const count = q.rooms ?? 1;
    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    const filter: Record<string, unknown> = { status: HotelStatus.Active };
    if (q.country) filter.countryCode = q.country;
    if (q.city) filter.cityName = new RegExp(`^${escapeRegex(q.city)}$`, 'i');

    const hotels = await this.hotels.find(filter).lean().exec();
    const available = hotels.length
      ? await this.findCandidateRooms(
          hotels.map((h) => h._id),
          q.checkIn,
          q.checkOut,
        )
      : [];

    const grouped = new Map<string, typeof available>();
    for (const room of available) {
      if (!isScheduleAvailable(room, q.checkIn, q.checkOut)) continue;
      const key = String(room.hotelId);
      const list = grouped.get(key) ?? [];
      list.push(room);
      grouped.set(key, list);
    }

    const results = hotels.flatMap((hotel) => {
      if (q.minRating !== undefined && (hotel.ratingsCount ?? 0) === 0) return [];
      if (q.minRating !== undefined && (hotel.averageRating ?? 0) < q.minRating) return [];
      const rooms = grouped.get(String(hotel._id)) ?? [];
      const cheapest = cheapestFeasibleRoomPrice(rooms, count, q.guests);
      if (
        cheapest === null ||
        (q.minPricePerNightMinor !== undefined && cheapest < q.minPricePerNightMinor) ||
        (q.maxPricePerNightMinor !== undefined && cheapest > q.maxPricePerNightMinor)
      )
        return [];
      return [
        {
          id: String(hotel._id),
          name: hotel.name,
          cityName: hotel.cityName,
          countryCode: hotel.countryCode,
          starClass: hotel.starClass,
          averageRating: hotel.averageRating ?? 0,
          ratingsCount: hotel.ratingsCount ?? 0,
          availableRoomCount: rooms.length,
          cheapestQualifyingRoomPricePerNightMinor: cheapest,
          checkInTime: hotel.checkInTime,
          checkOutTime: hotel.checkOutTime,
        },
      ];
    });

    const sort = q.sort ?? HotelSearchSort.PriceAsc;
    results.sort((a, b) => {
      const priceDelta = a.cheapestQualifyingRoomPricePerNightMinor - b.cheapestQualifyingRoomPricePerNightMinor;
      const ratingDelta = a.averageRating - b.averageRating;
      const primary =
        sort === HotelSearchSort.PriceDesc
          ? -priceDelta
          : sort === HotelSearchSort.RatingAsc
            ? ratingDelta
            : sort === HotelSearchSort.RatingDesc
              ? -ratingDelta
              : priceDelta;
      return primary || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });

    return {
      ...toPage(results.slice((page - 1) * limit, page * limit), results.length, page, limit),
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      nights,
      guests: q.guests,
      requestedRooms: count,
      bookingConflictsChecked: true,
    };
  }

  /** HTL-15: Browse all schedule-available rooms and their exact stay prices. */
  async availableRooms(hotelId: string, q: AvailableHotelRoomsQueryDto) {
    const nights = validateHotelStay(q.checkIn, q.checkOut);
    const hotel = await this.hotels.findById(hotelId).lean().exec();
    if (!hotel || hotel.status !== HotelStatus.Active) {
      throw new NotFoundException('Hotel not found or unavailable');
    }

    const candidates = await this.findCandidateRooms([new Types.ObjectId(hotelId)], q.checkIn, q.checkOut);
    const rooms = candidates
      .filter((r) => isScheduleAvailable(r, q.checkIn, q.checkOut))
      .map((r) => ({
        id: String(r._id),
        hotelId: String(r.hotelId),
        roomLabel: r.roomLabel,
        roomType: r.roomType,
        beds: r.beds,
        maxOccupancy: r.maxOccupancy,
        pricePerNightMinor: r.pricePerNightMinor,
        totalStayPriceMinor: r.pricePerNightMinor * nights,
      }));
    rooms.sort(
      (a, b) =>
        a.pricePerNightMinor - b.pricePerNightMinor ||
        a.roomLabel.localeCompare(b.roomLabel) ||
        a.id.localeCompare(b.id),
    );

    const page = q.page ?? 1;
    const limit = q.limit ?? 10;
    return {
      ...toPage(rooms.slice((page - 1) * limit, page * limit), rooms.length, page, limit),
      hotelId,
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      nights,
      bookingConflictsChecked: true,
    };
  }
}
