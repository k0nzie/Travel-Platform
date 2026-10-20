import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { paginate } from '../../common/utils/paginate';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { Notification, NotificationDocument, NotificationType } from './schemas/notification.schema';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@InjectModel(Notification.name) private readonly model: Model<NotificationDocument>) {}

  /**
   * GEN-01. Never throws: a failed notification must not roll back a booking.
   *
   *   await this.notifications.notify(booking.userId, {
   *     type: NotificationType.BookingConfirmed,
   *     title: 'Flight booking confirmed',
   *     message: `Your booking ${ref} is confirmed.`,
   *     link: `/bookings/flights/${booking.id}`,
   *     data: { bookingId: booking.id, reference: ref },
   *   });
   */
  async notify(userId: string | Types.ObjectId, input: NotifyInput) {
    try {
      return await this.model.create({ userId: new Types.ObjectId(String(userId)), ...input });
    } catch (err) {
      this.logger.error(`Failed to notify ${userId}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Same notification to many users (e.g. all passengers of a cancelled flight). */
  async notifyMany(userIds: (string | Types.ObjectId)[], input: NotifyInput) {
    const unique = [...new Set(userIds.map(String))];
    if (!unique.length) return 0;
    try {
      const docs = await this.model.insertMany(
        unique.map((id) => ({ userId: new Types.ObjectId(id), ...input })),
        { ordered: false },
      );
      return docs.length;
    } catch (err) {
      this.logger.error(`Failed bulk notify: ${(err as Error).message}`);
      return 0;
    }
  }

  async list(userId: string, query: NotificationQueryDto) {
    const filter: Record<string, any> = { userId: new Types.ObjectId(userId) };
    if (query.unreadOnly) filter.readAt = null;
    const [page, unreadCount] = await Promise.all([
      paginate(this.model, filter, { page: query.page, limit: query.limit, sort: { createdAt: -1 } }),
      this.unreadCount(userId),
    ]);
    return { ...page, unreadCount };
  }

  unreadCount(userId: string) {
    return this.model.countDocuments({ userId: new Types.ObjectId(userId), readAt: null }).exec();
  }

  async markRead(userId: string, id: string) {
    const owner = { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) };
    await this.model.updateOne({ ...owner, readAt: null }, { readAt: new Date() }).exec();
    const doc = await this.model.findOne(owner).exec();
    if (!doc) throw new NotFoundException('Notification not found');
    return doc;
  }

  async markAllRead(userId: string) {
    const res = await this.model
      .updateMany({ userId: new Types.ObjectId(userId), readAt: null }, { readAt: new Date() })
      .exec();
    return { updated: res.modifiedCount };
  }
}
