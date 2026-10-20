import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { Session, SessionDocument } from './schemas/session.schema';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Only write lastActivityAt at most once a minute to avoid a DB write on every request. */
const TOUCH_INTERVAL_MS = 60_000;

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
    private readonly config: ConfigService,
  ) {}

  private get idleMs() {
    return this.config.get<number>('auth.sessionIdleMinutes') * 60_000;
  }

  private get refreshMs() {
    return this.config.get<number>('auth.refreshTokenDays') * 86_400_000;
  }

  async create(userId: string, meta: { userAgent?: string; ip?: string } = {}) {
    const refreshToken = randomBytes(48).toString('base64url');
    const now = new Date();
    const session = await this.sessionModel.create({
      userId: new Types.ObjectId(userId),
      refreshTokenHash: sha256(refreshToken),
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + this.refreshMs),
      userAgent: meta.userAgent?.slice(0, 300),
      ip: meta.ip,
    });
    return { session, refreshToken };
  }

  findById(sessionId: string) {
    if (!Types.ObjectId.isValid(sessionId)) return null;
    return this.sessionModel.findById(sessionId).exec();
  }

  findByRefreshToken(refreshToken: string) {
    return this.sessionModel.findOne({ refreshTokenHash: sha256(refreshToken) }).exec();
  }

  /** Why a session can't be used, or null if it is valid. */
  invalidReason(session: SessionDocument | null): 'missing' | 'revoked' | 'expired' | 'idle' | null {
    if (!session) return 'missing';
    if (session.revokedAt) return 'revoked';
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) return 'expired';
    if (session.lastActivityAt.getTime() + this.idleMs <= now) return 'idle';
    return null;
  }

  async touch(session: SessionDocument) {
    if (Date.now() - session.lastActivityAt.getTime() < TOUCH_INTERVAL_MS) return;
    await this.sessionModel.updateOne({ _id: session._id }, { lastActivityAt: new Date() }).exec();
  }

  /** Issues a new refresh token for the same session (rotation). */
  async rotate(session: SessionDocument) {
    const refreshToken = randomBytes(48).toString('base64url');
    await this.sessionModel
      .updateOne({ _id: session._id }, { refreshTokenHash: sha256(refreshToken), lastActivityAt: new Date() })
      .exec();
    return refreshToken;
  }

  async revoke(sessionId: string | Types.ObjectId, reason = 'logout') {
    await this.sessionModel
      .updateOne({ _id: sessionId, revokedAt: null }, { revokedAt: new Date(), revokedReason: reason })
      .exec();
  }

  /** Logs the user out everywhere (suspension, deactivation, password reset). */
  async revokeAllForUser(userId: string, reason: string, exceptSessionId?: string) {
    const filter: Record<string, any> = { userId: new Types.ObjectId(userId), revokedAt: null };
    if (exceptSessionId) filter._id = { $ne: new Types.ObjectId(exceptSessionId) };
    await this.sessionModel.updateMany(filter, { revokedAt: new Date(), revokedReason: reason }).exec();
  }
}
