import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccountStatus, ProviderType, Role } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { escapeRegex, paginate, toPage } from '../../common/utils/paginate';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';
import { BlogService } from '../blog/blog.service';
import { Comment, CommentDocument } from '../blog/schemas/comment.schema';
import { Post, PostDocument } from '../blog/schemas/post.schema';
import { FlightBooking, FlightBookingDocument } from '../flight-bookings/schemas/flight-booking.schema';
import { Airline } from '../flights/schemas/airline.schema';
import { HotelBooking, HotelBookingDocument } from '../hotel-bookings/schemas/hotel-booking.schema';
import { Hotel } from '../hotels/schemas/hotel.schema';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { toUserResponse, UsersService } from '../users/users.service';
import { AdminBookingsQueryDto, CreateModeratorDto, CreateReportDto, ResolveReportDto } from './dto/admin.dto';
import { HotelReviewsService } from '../hotel-bookings/hotel-reviews.service';
import { HotelReview, HotelReviewDocument } from '../hotel-bookings/schemas/hotel-review.schema';
import { ItinerariesService } from '../itineraries/itineraries.service';
import { Itinerary, ItineraryDocument } from '../itineraries/schemas/itinerary.schema';
import { ContentReport, ContentReportDocument, ReportContentType, ReportStatus } from './schemas/content-report.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(Airline.name) private readonly airlines: Model<any>,
    @InjectModel(Hotel.name) private readonly hotels: Model<any>,
    @InjectModel(FlightBooking.name) private readonly flightBookings: Model<FlightBookingDocument>,
    @InjectModel(HotelBooking.name) private readonly hotelBookings: Model<HotelBookingDocument>,
    @InjectModel(Post.name) private readonly posts: Model<PostDocument>,
    @InjectModel(Comment.name) private readonly comments: Model<CommentDocument>,
    @InjectModel(ContentReport.name) private readonly reports: Model<ContentReportDocument>,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly blog: BlogService,
    private readonly hotelReviews: HotelReviewsService,
    private readonly itineraries: ItinerariesService,
    @InjectModel(HotelReview.name) private readonly reviewModel: Model<HotelReviewDocument>,
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<ItineraryDocument>,
  ) {}

  async createModerator(admin: AuthUser, dto: CreateModeratorDto, ip?: string) {
    if (!Types.ObjectId.isValid(dto.providerId)) throw new BadRequestException('Invalid provider ID');
    const providerModel: Model<any> = dto.providerType === ProviderType.Airline ? this.airlines : this.hotels;
    const provider = (await providerModel.findById(dto.providerId).select('_id name').lean().exec()) as unknown as {
      _id: Types.ObjectId;
      name: string;
    } | null;
    if (!provider) throw new NotFoundException(`${dto.providerType} not found`);

    const role = dto.providerType === ProviderType.Airline ? Role.AirlineModerator : Role.HotelModerator;
    const account = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      password: dto.temporaryPassword,
      role,
      mustChangePassword: true,
      moderatorAssignment: { providerType: dto.providerType, providerId: dto.providerId },
    });
    await this.audit.log(admin, {
      action: AuditAction.ModeratorCreated,
      targetType: 'user',
      targetId: account._id,
      metadata: { email: account.email, providerType: dto.providerType, providerId: dto.providerId },
      ip,
    });
    return {
      moderator: toUserResponse(account),
      assignedProvider: { id: String(provider._id), name: provider.name },
    };
  }

  async listAccounts(query: { page?: number; limit?: number; role?: Role; status?: AccountStatus; q?: string }) {
    const filter: Record<string, any> = {};
    if (query.role) filter.role = query.role;
    if (query.status) filter.status = query.status;
    if (query.q?.trim()) {
      const escaped = escapeRegex(query.q.trim());
      filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }];
    }
    const page = await paginate<User & { _id: Types.ObjectId }>(this.users, filter, {
      page: query.page,
      limit: query.limit,
      sort: { createdAt: -1 },
      select:
        'name email role status phone preferredCurrency mustChangePassword moderatorAssignment createdAt lastLoginAt',
    });
    return { ...page, items: page.items.map((account) => toUserResponse(account)) };
  }

  async setAccountStatus(
    admin: AuthUser,
    id: string,
    status: AccountStatus.Active | AccountStatus.Suspended,
    reason?: string,
    ip?: string,
  ) {
    const account = await this.usersService.setStatus(id, status);
    const suspended = status === AccountStatus.Suspended;
    const moderator = account.role === Role.AirlineModerator || account.role === Role.HotelModerator;
    await this.audit.log(admin, {
      action: suspended
        ? moderator
          ? AuditAction.ModeratorSuspended
          : AuditAction.UserSuspended
        : moderator
          ? AuditAction.ModeratorReactivated
          : AuditAction.UserReactivated,
      targetType: 'user',
      targetId: id,
      reason,
      metadata: { email: account.email, role: account.role },
      ip,
    });
    await this.notifications.notify(id, {
      type: suspended ? NotificationType.AccountSuspended : NotificationType.AccountReactivated,
      title: suspended ? 'Account suspended' : 'Account reactivated',
      message: suspended
        ? `An administrator suspended your account${reason ? `: ${reason}` : '.'}`
        : 'An administrator reactivated your account.',
      data: { status },
    });
    return toUserResponse(account);
  }

  // ---------- GEN-09 / GEN-10: reports and moderation ----------

  /** One place that knows how to check, hide, unhide and delete each kind of user content. */
  private moderationTarget(type: ReportContentType) {
    switch (type) {
      case ReportContentType.Post:
      case ReportContentType.Comment: {
        const t = type === ReportContentType.Post ? 'post' : 'comment';
        return {
          reportable: (id: string) => this.blog.isReportable(t, id),
          setHidden: (id: string, hidden: boolean) => this.blog.setHiddenForModeration(t, id, hidden),
          remove: (id: string) => this.blog.deleteForModeration(t, id),
        };
      }
      case ReportContentType.Review:
        return {
          reportable: (id: string) => this.hotelReviews.isReportable(id),
          setHidden: (id: string, hidden: boolean) => this.hotelReviews.setHiddenForModeration(id, hidden),
          remove: (id: string) => this.hotelReviews.removeForModeration(id),
        };
      case ReportContentType.Itinerary:
        return {
          reportable: (id: string) => this.itineraries.isReportable(id),
          setHidden: (id: string, hidden: boolean) => this.itineraries.setHiddenForModeration(id, hidden),
          remove: (id: string) => this.itineraries.removeForModeration(id),
        };
      default:
        throw new BadRequestException('Unknown content type');
    }
  }

  /** GEN-09: report a post, comment, hotel review or public itinerary, at most once per item. */
  async createReport(reporterId: string, dto: CreateReportDto) {
    if (!Types.ObjectId.isValid(dto.contentId)) throw new BadRequestException('Invalid content ID');
    if (!(await this.moderationTarget(dto.contentType).reportable(dto.contentId))) {
      throw new NotFoundException('Content not found');
    }
    const key = {
      reporterId: new Types.ObjectId(reporterId),
      contentType: dto.contentType,
      contentId: new Types.ObjectId(dto.contentId),
    };
    const duplicate = () =>
      new ConflictException({ message: 'You have already reported this content', code: 'ALREADY_REPORTED' });
    if (await this.reports.exists(key)) throw duplicate();
    try {
      return await this.reports.create({ ...key, reason: dto.reason, status: ReportStatus.Pending });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) throw duplicate();
      throw error;
    }
  }

  async listReports(query: { page?: number; limit?: number; status?: ReportStatus }) {
    const result = await paginate(this.reports, query.status ? { status: query.status } : {}, {
      page: query.page,
      limit: query.limit,
      sort: { createdAt: -1 },
      populate: [
        { path: 'reporterId', select: 'name email' },
        { path: 'reviewedBy', select: 'name email' },
      ],
    });
    const idsOf = (type: ReportContentType) =>
      result.items.filter((report) => report.contentType === type).map((report) => report.contentId);
    const [posts, comments, reviews, itineraries] = await Promise.all([
      this.posts
        .find({ _id: { $in: idsOf(ReportContentType.Post) } })
        .select('title content status author hidden')
        .lean()
        .exec(),
      this.comments
        .find({ _id: { $in: idsOf(ReportContentType.Comment) } })
        .select('content post author hidden')
        .lean()
        .exec(),
      this.reviewModel
        .find({ _id: { $in: idsOf(ReportContentType.Review) } })
        .select('rating review hotelId userId hidden')
        .lean()
        .exec(),
      this.itineraryModel
        .find({ _id: { $in: idsOf(ReportContentType.Itinerary) } })
        .select('title ownerId visibility hidden')
        .lean()
        .exec(),
    ]);
    const byId = new Map<string, unknown>(
      [...posts, ...comments, ...reviews, ...itineraries].map((doc: any) => [String(doc._id), doc]),
    );
    return {
      ...result,
      items: result.items.map((report) => ({ ...report, content: byId.get(String(report.contentId)) ?? null })),
    };
  }

  async resolveReport(admin: AuthUser, reportId: string, dto: ResolveReportDto, ip?: string) {
    const report = await this.reports.findById(reportId).exec();
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.Pending) throw new ConflictException('This report has already been reviewed');

    if (dto.action !== 'dismiss') {
      const target = this.moderationTarget(report.contentType);
      const id = String(report.contentId);
      const done = dto.action === 'hide' ? await target.setHidden(id, true) : await target.remove(id);
      if (!done) throw new NotFoundException('Reported content no longer exists');
      // Other pending reports about the same item are settled by the same decision.
      await this.reports
        .updateMany(
          {
            _id: { $ne: report._id },
            contentType: report.contentType,
            contentId: report.contentId,
            status: ReportStatus.Pending,
          },
          {
            $set: {
              status: ReportStatus.Resolved,
              reviewedBy: new Types.ObjectId(admin.id),
              reviewedAt: new Date(),
              resolutionNote: dto.note,
            },
          },
        )
        .exec();
    }

    report.status = dto.action === 'dismiss' ? ReportStatus.Dismissed : ReportStatus.Resolved;
    report.reviewedBy = new Types.ObjectId(admin.id);
    report.reviewedAt = new Date();
    report.resolutionNote = dto.note;
    await report.save();

    const action =
      dto.action === 'dismiss'
        ? AuditAction.ReportDismissed
        : dto.action === 'hide'
          ? AuditAction.ContentHidden
          : AuditAction.ContentDeleted;
    await this.audit.log(admin, {
      action,
      targetType: dto.action === 'dismiss' ? 'report' : report.contentType,
      targetId: dto.action === 'dismiss' ? report._id : report.contentId,
      reason: dto.note,
      metadata: { reportId: String(report._id), contentType: report.contentType, contentId: String(report.contentId) },
      ip,
    });
    return report;
  }

  /** GEN-10: hide or unhide any user content directly, without a report. */
  async setContentHidden(
    admin: AuthUser,
    type: ReportContentType,
    id: string,
    hidden: boolean,
    reason?: string,
    ip?: string,
  ) {
    if (!(await this.moderationTarget(type).setHidden(id, hidden))) throw new NotFoundException('Content not found');
    await this.audit.log(admin, {
      action: hidden ? AuditAction.ContentHidden : AuditAction.ContentUnhidden,
      targetType: type,
      targetId: id,
      reason,
      ip,
    });
    return { type, id, hidden };
  }

  /** GEN-10: delete any user content directly. */
  async deleteContent(admin: AuthUser, type: ReportContentType, id: string, reason?: string, ip?: string) {
    if (!(await this.moderationTarget(type).remove(id))) throw new NotFoundException('Content not found');
    await this.reports
      .updateMany(
        { contentType: type, contentId: new Types.ObjectId(id), status: ReportStatus.Pending },
        { $set: { status: ReportStatus.Resolved, reviewedBy: new Types.ObjectId(admin.id), reviewedAt: new Date() } },
      )
      .exec();
    await this.audit.log(admin, { action: AuditAction.ContentDeleted, targetType: type, targetId: id, reason, ip });
    return { type, id, deleted: true };
  }

  // ---------- ACC-17 ----------

  async listBookings(query: AdminBookingsQueryDto): Promise<PaginatedResult<any>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (query.status) filter.status = query.status;
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) {
        const to = new Date(query.to);
        // A plain date means "through the end of that day".
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setUTCHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
      if (query.from && query.to && filter.createdAt.$gte > filter.createdAt.$lte) {
        throw new BadRequestException('"from" must be on or before "to"');
      }
    }

    const flightQuery = (take: number, skip = 0) =>
      this.flightBookings
        .find(filter)
        .select('reference userId status legs departureAt lastArrivalAt totalMinor currency createdAt')
        .populate('userId', 'name email')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(take)
        .lean()
        .exec();
    const hotelQuery = (take: number, skip = 0) =>
      this.hotelBookings
        .find(filter)
        .select('reference userId hotelId hotelName status checkIn checkOut rooms totalMinor currency createdAt')
        .populate('userId', 'name email')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(take)
        .lean()
        .exec();

    if (query.type === 'flight') {
      const [items, total] = await Promise.all([
        flightQuery(limit, offset),
        this.flightBookings.countDocuments(filter),
      ]);
      return toPage(
        items.map((item) => ({ ...item, bookingType: 'flight' })),
        total,
        page,
        limit,
      );
    }
    if (query.type === 'hotel') {
      const [items, total] = await Promise.all([hotelQuery(limit, offset), this.hotelBookings.countDocuments(filter)]);
      return toPage(
        items.map((item) => ({ ...item, bookingType: 'hotel' })),
        total,
        page,
        limit,
      );
    }

    const [flights, hotels, flightTotal, hotelTotal] = await Promise.all([
      flightQuery(offset + limit),
      hotelQuery(offset + limit),
      this.flightBookings.countDocuments(filter),
      this.hotelBookings.countDocuments(filter),
    ]);
    const items = [
      ...flights.map((booking) => ({ ...booking, bookingType: 'flight' as const })),
      ...hotels.map((booking) => ({ ...booking, bookingType: 'hotel' as const })),
    ]
      .sort((a, b) => {
        const dateOrder = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return dateOrder || String(b._id).localeCompare(String(a._id));
      })
      .slice(offset, offset + limit);
    return toPage(items, flightTotal + hotelTotal, page, limit);
  }
}
