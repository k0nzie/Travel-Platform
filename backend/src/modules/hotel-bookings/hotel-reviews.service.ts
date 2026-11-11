import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { BookingStatus, Role } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertOwner } from '../../common/utils/access.util';
import { paginate } from '../../common/utils/paginate';
import { Hotel, HotelDocument } from '../hotels/schemas/hotel.schema';
import { publicAuthor } from '../users/users.service';
import { CreateHotelReviewDto, HotelReviewsQueryDto, UpdateHotelReviewDto } from './dto/hotel-review.dto';
import { canReviewHotelBooking } from './hotel-reviews.logic';
import { HotelBooking, HotelBookingDocument } from './schemas/hotel-booking.schema';
import { HotelReview, HotelReviewDocument } from './schemas/hotel-review.schema';

@Injectable()
export class HotelReviewsService {
  constructor(
    @InjectModel(HotelReview.name) private readonly reviews: Model<HotelReviewDocument>,
    @InjectModel(HotelBooking.name) private readonly bookings: Model<HotelBookingDocument>,
    @InjectModel(Hotel.name) private readonly hotels: Model<HotelDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private assertTraveller(user: AuthUser) {
    if (!user || user.role !== Role.User) throw new ForbiddenException('Registered user role required');
  }

  /** Recalculate from the actual reviews, never from a potentially stale cached average. */
  private async recalculate(hotelId: Types.ObjectId, session: ClientSession) {
    const [stats] = await this.reviews
      .aggregate<{ count: number; total: number }>([
        { $match: { hotelId } },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$rating' } } },
      ])
      .session(session)
      .exec();
    const count = stats?.count ?? 0;
    const average = count ? Math.round(((stats?.total ?? 0) / count) * 100) / 100 : 0;
    const saved = await this.hotels
      .updateOne({ _id: hotelId }, { $set: { averageRating: average, ratingsCount: count } }, { session })
      .exec();
    if (saved.matchedCount !== 1) throw new NotFoundException('Hotel not found');
    // Writes to the same Hotel row serialize concurrent review transactions.
    return { averageRating: average, ratingsCount: count };
  }

  /** HTL-23 / GEN-11: move confirmed stays to Completed after checkout day has passed.
   * This job is idempotent and does not modify room history or inventory locks. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async completeFinishedStays() {
    const today = new Date().toISOString().slice(0, 10);
    const result = await this.bookings
      .updateMany(
        { status: BookingStatus.Confirmed, checkOut: { $lt: today } },
        { $set: { status: BookingStatus.Completed } },
      )
      .exec();
    return result.modifiedCount;
  }

  /** HTL-23: one user rating + optional text per completed reservation, regardless of room count. */
  async create(user: AuthUser, dto: CreateHotelReviewDto) {
    this.assertTraveller(user);
    try {
      return await this.connection.transaction(async (session) => {
        const booking = await this.bookings.findById(dto.bookingId).session(session).exec();
        if (!booking) throw new NotFoundException('Booking not found');
        assertOwner(booking.userId, user, { resource: 'Booking' });
        if (!canReviewHotelBooking(booking.status, booking.checkOut)) {
          throw new ConflictException({
            message: 'A review requires a completed hotel stay',
            code: 'REVIEW_STAY_NOT_COMPLETE',
          });
        }
        // The scheduled completion job and review creation may race; both use a conditional state change.
        if (booking.status === BookingStatus.Confirmed) {
          const marked = await this.bookings
            .updateOne(
              { _id: booking._id, status: BookingStatus.Confirmed, checkOut: { $lt: new Date().toISOString().slice(0, 10) } },
              { $set: { status: BookingStatus.Completed } },
              { session },
            )
            .exec();
          if (marked.modifiedCount !== 1) throw new ConflictException('Booking state changed; please retry');
        }
        const [created] = await this.reviews.create(
          [{ bookingId: booking._id, hotelId: booking.hotelId, userId: new Types.ObjectId(user.id),
            rating: dto.rating, review: dto.review?.trim() ?? '' }],
          { session },
        );
        const rating = await this.recalculate(booking.hotelId, session);
        return { ...this.toView(created), ...rating };
      });
    } catch (error) {
      if ((error as any)?.code === 11000) {
        throw new ConflictException({ message: 'This reservation already has a review', code: 'REVIEW_ALREADY_EXISTS' });
      }
      throw error;
    }
  }

  async update(user: AuthUser, reviewId: string, dto: UpdateHotelReviewDto) {
    this.assertTraveller(user);
    if ((dto as any).rating === null || (dto as any).review === null) {
      throw new BadRequestException('Rating and review text cannot be null');
    }
    if (dto.rating === undefined && dto.review === undefined) {
      throw new BadRequestException('Provide a rating or review text to update');
    }
    return this.connection.transaction(async (session) => {
      const existing = await this.reviews.findById(reviewId).session(session).exec();
      if (!existing) throw new NotFoundException('Review not found');
      assertOwner(existing.userId, user, { resource: 'Review' });
      const changes: { rating?: number; review?: string } = {};
      if (dto.rating !== undefined) changes.rating = dto.rating;
      if (dto.review !== undefined) changes.review = dto.review.trim();
      const updated = await this.reviews
        .findOneAndUpdate({ _id: existing._id, userId: existing.userId }, { $set: changes },
          { new: true, session, runValidators: true })
        .exec();
      if (!updated) throw new NotFoundException('Review not found');
      const rating = await this.recalculate(updated.hotelId, session);
      return { ...this.toView(updated), ...rating };
    });
  }

  async delete(user: AuthUser, reviewId: string) {
    this.assertTraveller(user);
    return this.connection.transaction(async (session) => {
      const existing = await this.reviews.findById(reviewId).session(session).exec();
      if (!existing) throw new NotFoundException('Review not found');
      assertOwner(existing.userId, user, { resource: 'Review' });
      const deleted = await this.reviews
        .findOneAndDelete({ _id: existing._id, userId: existing.userId }, { session })
        .exec();
      if (!deleted) throw new NotFoundException('Review not found');
      const rating = await this.recalculate(deleted.hotelId, session);
      return { deleted: true, id: String(deleted._id), ...rating };
    });
  }

  /** HTL-24: Guest-accessible newest-first reviews and current aggregate ratings. */
  async listPublic(hotelId: string, query: HotelReviewsQueryDto) {
    const hotel = await this.hotels.findById(hotelId).select('name averageRating ratingsCount').lean().exec();
    if (!hotel) throw new NotFoundException('Hotel not found');
    const paged = await paginate(this.reviews, { hotelId: new Types.ObjectId(hotelId) }, {
      page: query.page,
      limit: query.limit,
      sort: { createdAt: -1, _id: -1 },
      populate: { path: 'userId', select: 'name status' },
    });
    return {
      hotelId,
      hotelName: hotel.name,
      averageRating: hotel.averageRating ?? 0,
      ratingsCount: hotel.ratingsCount ?? 0,
      ...paged,
      items: paged.items.map((r: any) => ({
        id: String(r._id),
        rating: r.rating,
        review: r.review ?? '',
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        author: publicAuthor(r.userId),
      })),
    };
  }

  private toView(review: any) {
    return {
      id: String(review._id),
      hotelId: String(review.hotelId),
      bookingId: String(review.bookingId),
      rating: review.rating,
      review: review.review ?? '',
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
