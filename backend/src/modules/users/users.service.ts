import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { AccountStatus, ProviderType, Role } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';
import { ReferenceDataService } from '../reference-data/reference-data.service';
import { AccountHooksService } from './account-hooks.service';
import { UpdateProfileDto } from './dto/users.dto';
import { User, UserDocument } from './schemas/user.schema';
import { SessionsService } from './sessions.service';

export interface CreateAccountInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
  mustChangePassword?: boolean;
  termsAcceptedAt?: Date;
  moderatorAssignment?: { providerType: ProviderType; providerId: string };
}

/** Public-safe view of an account. */
export function toUserResponse(user: User & { _id?: any; id?: any }) {
  return {
    id: String(user._id ?? user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    phone: user.phone ?? null,
    preferredCurrency: user.preferredCurrency,
    mustChangePassword: !!user.mustChangePassword,
    moderatorAssignment: user.moderatorAssignment
      ? {
          providerType: user.moderatorAssignment.providerType,
          providerId: String(user.moderatorAssignment.providerId),
        }
      : null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

/**
 * ACC-12: how an author appears next to a comment, review, post or itinerary.
 * Deactivated accounts show as "Deleted user". Populate with `select: 'name status'`.
 */
export function publicAuthor(user: { _id?: any; name?: string; status?: AccountStatus } | null | undefined) {
  if (!user || user.status === AccountStatus.Deactivated) return { id: null, name: 'Deleted user' };
  return { id: String(user._id), name: user.name };
}

@Injectable()
export class UsersService {
  private deactivatedCache: { ids: Types.ObjectId[]; loadedAt: number } | null = null;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly sessions: SessionsService,
    private readonly hooks: AccountHooksService,
    private readonly reference: ReferenceDataService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  // ---------- password helpers (GEN-13) ----------

  hashPassword(plain: string) {
    return bcrypt.hash(plain, this.config.get<number>('auth.bcryptRounds'));
  }

  verifyPassword(plain: string, hash: string) {
    return bcrypt.compare(plain, hash);
  }

  // ---------- reads ----------

  findById(id: string) {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.userModel.findById(id).exec();
  }

  async findByIdOrThrow(id: string) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  /** Includes password hash and lockout fields — for AuthService only. */
  findByEmailWithSecrets(email: string) {
    return this.userModel
      .findOne({ email: email.trim().toLowerCase() })
      .select('+passwordHash +failedLoginAttempts +lockUntil')
      .exec();
  }

  emailExists(email: string) {
    return this.userModel.exists({ email: email.trim().toLowerCase() }).exec();
  }

  /**
   * ACC-12: content of deactivated users must be hidden. Blog / itinerary queries
   * add `{ authorId: { $nin: await usersService.getDeactivatedUserIds() } }`.
   * Cached for 60 seconds.
   */
  async getDeactivatedUserIds(): Promise<Types.ObjectId[]> {
    if (!this.deactivatedCache || Date.now() - this.deactivatedCache.loadedAt > 60_000) {
      const docs = await this.userModel.find({ status: AccountStatus.Deactivated }, { _id: 1 }).lean().exec();
      this.deactivatedCache = { ids: docs.map((d) => d._id as Types.ObjectId), loadedAt: Date.now() };
    }
    return this.deactivatedCache.ids;
  }

  // ---------- writes ----------

  /**
   * Generic account creation. Used by registration (ACC-01), admin seeding (ACC-18)
   * and moderator creation (ACC-13, Person 6).
   */
  async create(input: CreateAccountInput): Promise<UserDocument> {
    const email = input.email.trim().toLowerCase();
    if (await this.emailExists(email)) {
      throw new ConflictException({
        message: 'Email is already registered',
        code: 'EMAIL_TAKEN',
        errors: [{ field: 'email', messages: ['Email is already registered'] }],
      });
    }
    return this.userModel.create({
      name: input.name.trim(),
      email,
      passwordHash: await this.hashPassword(input.password),
      role: input.role ?? Role.User,
      mustChangePassword: !!input.mustChangePassword,
      termsAcceptedAt: input.termsAcceptedAt,
      preferredCurrency: this.config.get<string>('platformCurrency'),
      moderatorAssignment: input.moderatorAssignment
        ? {
            providerType: input.moderatorAssignment.providerType,
            providerId: new Types.ObjectId(input.moderatorAssignment.providerId),
          }
        : undefined,
    });
  }

  /** ACC-09 */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.preferredCurrency) {
      await this.reference.assertSupportedCurrency(dto.preferredCurrency);
    }
    const update: Partial<User> = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.phone !== undefined) update.phone = dto.phone;
    if (dto.preferredCurrency !== undefined) update.preferredCurrency = dto.preferredCurrency;

    const user = await this.userModel.findByIdAndUpdate(userId, update, { new: true, runValidators: true }).exec();
    if (!user) throw new NotFoundException('Account not found');
    return toUserResponse(user);
  }

  /** ACC-08 (and the forced change after ACC-07a / ACC-13). Keeps only the current session alive. */
  async changePassword(user: AuthUser, currentPassword: string, newPassword: string) {
    const account = await this.userModel.findById(user.id).select('+passwordHash').exec();
    if (!account) throw new NotFoundException('Account not found');

    if (!(await this.verifyPassword(currentPassword, account.passwordHash))) {
      throw new BadRequestException({
        message: 'Current password is incorrect',
        errors: [{ field: 'currentPassword', messages: ['Current password is incorrect'] }],
      });
    }
    if (await this.verifyPassword(newPassword, account.passwordHash)) {
      throw new BadRequestException({
        message: 'New password must be different from the current password',
        errors: [{ field: 'newPassword', messages: ['New password must be different from the current password'] }],
      });
    }

    account.passwordHash = await this.hashPassword(newPassword);
    account.mustChangePassword = false;
    account.passwordChangedAt = new Date();
    await account.save();
    await this.sessions.revokeAllForUser(user.id, 'password_changed', user.sessionId);
    return toUserResponse(account);
  }

  /** ACC-07a: admin sets a temporary password; the account must change it at next login. */
  async adminResetPassword(admin: AuthUser, targetId: string, temporaryPassword: string, ip?: string) {
    const target = await this.findByIdOrThrow(targetId);
    if (target.role === Role.Admin) {
      throw new ForbiddenException('Admin passwords cannot be reset through this endpoint');
    }

    await this.userModel
      .updateOne(
        { _id: target._id },
        {
          passwordHash: await this.hashPassword(temporaryPassword),
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          failedLoginAttempts: 0,
          $unset: { lockUntil: 1 },
        },
      )
      .exec();
    await this.sessions.revokeAllForUser(targetId, 'admin_password_reset');
    await this.audit.log(admin, {
      action: AuditAction.PasswordResetByAdmin,
      targetType: 'user',
      targetId,
      metadata: { email: target.email, role: target.role },
      ip,
    });
    return { message: 'Temporary password set. The account must choose a new password at next login.' };
  }

  /** ACC-12: self-deactivation, blocked while upcoming Confirmed bookings exist. */
  async deactivateSelf(user: AuthUser, password: string) {
    if (user.role !== Role.User) {
      throw new ForbiddenException('Only traveller accounts can deactivate themselves');
    }
    const account = await this.userModel.findById(user.id).select('+passwordHash').exec();
    if (!account) throw new NotFoundException('Account not found');
    if (!(await this.verifyPassword(password, account.passwordHash))) {
      throw new UnauthorizedException({
        message: 'Password is incorrect',
        errors: [{ field: 'password', messages: ['Password is incorrect'] }],
      });
    }

    const blockers = await this.hooks.getDeactivationBlockers(user.id);
    if (blockers.length) {
      throw new ConflictException({
        message: 'Account cannot be deactivated while you have upcoming confirmed bookings',
        code: 'HAS_UPCOMING_BOOKINGS',
        errors: blockers.map((reason) => ({ field: 'bookings', messages: [reason] })),
      });
    }

    account.status = AccountStatus.Deactivated;
    account.deactivatedAt = new Date();
    await account.save();
    this.deactivatedCache = null;
    await this.sessions.revokeAllForUser(user.id, 'deactivated');
    return { message: 'Your account has been deactivated' };
  }

  /**
   * Status change used by admin features (ACC-15, ACC-16 — Person 6).
   * Suspending logs the account out everywhere. Audit + notification are the caller's job.
   */
  async setStatus(targetId: string, status: AccountStatus.Active | AccountStatus.Suspended) {
    const target = await this.findByIdOrThrow(targetId);
    if (target.role === Role.Admin) throw new ForbiddenException('Admin accounts cannot be suspended');
    if (target.status === AccountStatus.Deactivated) {
      throw new ConflictException('This account was deactivated by its owner');
    }
    if (target.status === status) {
      throw new ConflictException(`Account is already ${status}`);
    }

    target.status = status;
    target.suspendedAt = status === AccountStatus.Suspended ? new Date() : undefined;
    await target.save();
    if (status === AccountStatus.Suspended) {
      await this.sessions.revokeAllForUser(targetId, 'suspended');
    }
    return target;
  }
}
