import { ForbiddenException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { AccountStatus, ROLE_HOME } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SessionsService } from '../users/sessions.service';
import { toUserResponse, UsersService } from '../users/users.service';
import { RegisterDto } from './dto/auth.dto';

export interface AccessTokenPayload {
  sub: string; // user id
  sid: string; // session id
  role: string;
}

const INVALID_CREDENTIALS = 'Invalid email or password';
const HTTP_LOCKED = 423;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /** ACC-01 */
  async register(dto: RegisterDto) {
    const user = await this.users.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      termsAcceptedAt: new Date(),
    });
    return toUserResponse(user);
  }

  /** ACC-04 + ACC-05 */
  async login(email: string, password: string, meta: { userAgent?: string; ip?: string }) {
    const user = await this.users.findByEmailWithSecrets(email);
    if (!user) {
      // Spend similar time as a real check so response timing doesn't reveal which emails exist.
      await this.users.verifyPassword(password, await this.dummyHash());
      throw new UnauthorizedException({ message: INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' });
    }

    const lockedMinutes = this.minutesLeft(user.lockUntil);
    if (lockedMinutes > 0) throw this.lockedError(lockedMinutes);

    const valid = await this.users.verifyPassword(password, user.passwordHash);
    if (!valid) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException({ message: INVALID_CREDENTIALS, code: 'INVALID_CREDENTIALS' });
    }

    if (user.status === AccountStatus.Suspended) {
      throw new ForbiddenException({ message: 'Your account has been suspended', code: 'ACCOUNT_SUSPENDED' });
    }
    if (user.status === AccountStatus.Deactivated) {
      throw new ForbiddenException({ message: 'This account has been deactivated', code: 'ACCOUNT_DEACTIVATED' });
    }

    await this.userModel
      .updateOne({ _id: user._id }, { failedLoginAttempts: 0, lastLoginAt: new Date(), $unset: { lockUntil: 1 } })
      .exec();

    const { session, refreshToken } = await this.sessions.create(String(user._id), meta);
    const accessToken = this.signAccessToken({ sub: String(user._id), sid: String(session._id), role: user.role });

    return {
      accessToken,
      refreshToken,
      body: {
        user: toUserResponse(user),
        mustChangePassword: user.mustChangePassword,
        redirectTo: user.mustChangePassword ? '/change-password' : ROLE_HOME[user.role],
      },
    };
  }

  /** ACC-19: rotates the refresh token and issues a new access token. */
  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw this.sessionExpired();
    const session = await this.sessions.findByRefreshToken(refreshToken);
    const reason = this.sessions.invalidReason(session);
    if (reason) {
      if (session && reason === 'idle') await this.sessions.revoke(session._id, 'idle_timeout');
      throw this.sessionExpired();
    }

    const user = await this.users.findById(String(session.userId));
    if (!user || user.status !== AccountStatus.Active) {
      await this.sessions.revoke(session._id, 'account_inactive');
      throw this.sessionExpired();
    }

    const newRefreshToken = await this.sessions.rotate(session);
    const accessToken = this.signAccessToken({ sub: String(user._id), sid: String(session._id), role: user.role });
    return { accessToken, refreshToken: newRefreshToken, body: { user: toUserResponse(user) } };
  }

  /** ACC-06: revokes the server-side session (cookies are cleared by the controller). */
  async logout(accessToken?: string, refreshToken?: string) {
    let sessionId: string | undefined;
    if (accessToken) {
      const payload = this.decodeIgnoringExpiry(accessToken);
      sessionId = payload?.sid;
    }
    if (!sessionId && refreshToken) {
      const session = await this.sessions.findByRefreshToken(refreshToken);
      sessionId = session ? String(session._id) : undefined;
    }
    if (sessionId) await this.sessions.revoke(sessionId, 'logout');
  }

  async me(user: AuthUser) {
    return toUserResponse(await this.users.findByIdOrThrow(user.id));
  }

  // ---------- helpers ----------

  private dummyHashPromise: Promise<string> | null = null;
  /** A real bcrypt hash used to equalise timing for unknown emails. */
  private dummyHash() {
    this.dummyHashPromise ??= this.users.hashPassword('timing-equaliser-not-a-password');
    return this.dummyHashPromise;
  }

  signAccessToken(payload: AccessTokenPayload) {
    return this.jwt.sign(payload);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return this.jwt.verify<AccessTokenPayload>(token);
  }

  private decodeIgnoringExpiry(token: string): AccessTokenPayload | null {
    try {
      return this.jwt.verify<AccessTokenPayload>(token, { ignoreExpiration: true });
    } catch {
      return null;
    }
  }

  /** ACC-05: atomically count failures; lock for 15 minutes on the 5th. */
  private async registerFailedAttempt(user: UserDocument) {
    const max = this.config.get<number>('auth.maxFailedLogins');
    const lockMinutes = this.config.get<number>('auth.lockMinutes');

    const updated = await this.userModel
      .findOneAndUpdate({ _id: user._id }, { $inc: { failedLoginAttempts: 1 } }, { new: true })
      .select('+failedLoginAttempts')
      .exec();

    if (updated && updated.failedLoginAttempts >= max) {
      await this.userModel
        .updateOne(
          { _id: user._id },
          { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + lockMinutes * 60_000) },
        )
        .exec();
      throw this.lockedError(lockMinutes);
    }
  }

  private minutesLeft(lockUntil?: Date) {
    if (!lockUntil) return 0;
    const ms = lockUntil.getTime() - Date.now();
    return ms > 0 ? Math.ceil(ms / 60_000) : 0;
  }

  private lockedError(minutes: number) {
    return new HttpException(
      {
        message: `Too many failed login attempts. Your account is locked for ${minutes} minute(s).`,
        code: 'ACCOUNT_LOCKED',
      },
      HTTP_LOCKED,
    );
  }

  private sessionExpired() {
    return new UnauthorizedException({ message: 'Your session has expired. Please log in again.', code: 'SESSION_EXPIRED' });
  }
}
