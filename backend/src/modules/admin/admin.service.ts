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
import { AccountStatusDto, CreateModeratorDto, CreateReportDto, ResolveReportDto } from './dto/admin.dto';
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

  async createReport(reporterId: string, dto: CreateReportDto) {
    if (!Types.ObjectId.isValid(dto.contentId)) throw new BadRequestException('Invalid content ID');
    const contentId = new Types.ObjectId(dto.contentId);
    const contentModel = (dto.contentType === ReportContentType.Post ? this.posts : this.comments) as Model<any>;
    const content = (await contentModel.findById(contentId).select('_id hidden').lean().exec()) as {
      hidden?: boolean;
    } | null;
    if (!content || content.hidden) throw new NotFoundException('Content not found');

    const existing = await this.reports.exists({
      reporterId: new Types.ObjectId(reporterId),
      contentType: dto.contentType,
      contentId,
      status: ReportStatus.Pending,
    });
    if (existing) throw new ConflictException('You already have a pending report for this content');
    return this.reports.create({
      reporterId: new Types.ObjectId(reporterId),
      contentType: dto.contentType,
      contentId,
      reason: dto.reason,
      status: ReportStatus.Pending,
    });
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
    const postIds = result.items
      .filter((report) => report.contentType === ReportContentType.Post)
      .map((report) => report.contentId);
    const commentIds = result.items
      .filter((report) => report.contentType === ReportContentType.Comment)
      .map((report) => report.contentId);
    const [posts, comments] = await Promise.all([
      this.posts
        .find({ _id: { $in: postIds } })
        .select('title content status author hidden')
        .lean()
        .exec(),
      this.comments
        .find({ _id: { $in: commentIds } })
        .select('content post author hidden')
        .lean()
        .exec(),
    ]);
    const postById = new Map(posts.map((post) => [String(post._id), post]));
    const commentById = new Map(comments.map((comment) => [String(comment._id), comment]));
    return {
      ...result,
      items: result.items.map((report) => ({
        ...report,
        content:
          report.contentType === ReportContentType.Post
            ? (postById.get(String(report.contentId)) ?? null)
            : (commentById.get(String(report.contentId)) ?? null),
      })),
    };
  }

  async resolveReport(admin: AuthUser, reportId: string, dto: ResolveReportDto, ip?: string) {
    const report = await this.reports.findById(reportId).exec();
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.Pending) throw new ConflictException('This report has already been reviewed');

    const contentModel = (report.contentType === ReportContentType.Post ? this.posts : this.comments) as Model<any>;
    const content = await contentModel.findById(report.contentId).select('_id hidden').lean().exec();
    if (dto.action !== 'dismiss' && !content) {
      throw new NotFoundException('Reported content no longer exists');
    }

    if (dto.action === 'hide' && content) {
      if (report.contentType === ReportContentType.Post) {
        await this.posts.updateOne({ _id: report.contentId }, { $set: { hidden: true } }).exec();
      } else {
        await this.comments.updateOne({ _id: report.contentId }, { $set: { hidden: true } }).exec();
      }
    }
    if (dto.action === 'delete' && content) {
      if (report.contentType === ReportContentType.Post) {
        await this.blog.deleteContentForModeration(String(report.contentId));
      } else {
        await this.comments.deleteOne({ _id: report.contentId }).exec();
      }
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

  async listBookings(query: {
    page?: number;
    limit?: number;
    type?: 'flight' | 'hotel';
  }): Promise<PaginatedResult<any>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const offset = (page - 1) * limit;
    if (query.type === 'flight') {
      const [items, total] = await Promise.all([
        this.flightBookings
          .find()
          .select('reference userId status legs departureAt lastArrivalAt totalMinor currency createdAt')
          .populate('userId', 'name email')
          .sort({ createdAt: -1, _id: -1 })
          .skip(offset)
          .limit(limit)
          .lean()
          .exec(),
        this.flightBookings.countDocuments(),
      ]);
      return toPage(
        items.map((item) => ({ ...item, bookingType: 'flight' })),
        total,
        page,
        limit,
      );
    }
    if (query.type === 'hotel') {
      const [items, total] = await Promise.all([
        this.hotelBookings
          .find()
          .select('reference userId hotelId hotelName status checkIn checkOut rooms totalMinor currency createdAt')
          .populate('userId', 'name email')
          .sort({ createdAt: -1, _id: -1 })
          .skip(offset)
          .limit(limit)
          .lean()
          .exec(),
        this.hotelBookings.countDocuments(),
      ]);
      return toPage(
        items.map((item) => ({ ...item, bookingType: 'hotel' })),
        total,
        page,
        limit,
      );
    }

    const [flights, hotels, flightTotal, hotelTotal] = await Promise.all([
      this.flightBookings
        .find()
        .select('reference userId status legs departureAt lastArrivalAt totalMinor currency createdAt')
        .populate('userId', 'name email')
        .sort({ createdAt: -1, _id: -1 })
        .limit(offset + limit)
        .lean()
        .exec(),
      this.hotelBookings
        .find()
        .select('reference userId hotelId hotelName status checkIn checkOut rooms totalMinor currency createdAt')
        .populate('userId', 'name email')
        .sort({ createdAt: -1, _id: -1 })
        .limit(offset + limit)
        .lean()
        .exec(),
      this.flightBookings.countDocuments(),
      this.hotelBookings.countDocuments(),
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
