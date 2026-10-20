import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AccountStatus } from '../constants/enums';
import { ALLOW_PENDING_PASSWORD_KEY, IS_PUBLIC_KEY } from '../decorators';
import { AuthUser } from '../interfaces/auth-user.interface';
import { ACCESS_COOKIE } from '../../modules/auth/auth-cookies';
import { AuthService } from '../../modules/auth/auth.service';
import { SessionsService } from '../../modules/users/sessions.service';
import { UsersService } from '../../modules/users/users.service';

/**
 * Global authentication guard (registered as APP_GUARD in AuthModule).
 *
 * - Reads the access token from the httpOnly cookie (ACC-19) — never from localStorage.
 * - Checks the server-side session: logged out, 30-min idle timeout (ACC-06), revoked.
 * - Checks the account is still active, so suspension takes effect immediately (ACC-15/16).
 * - Blocks every route except the allowed few while a password change is pending (ACC-07a, ACC-13).
 * - On @Public() routes it never throws, but still attaches the user when a valid session exists.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    if (isPublic) {
      try {
        req.user = await this.authenticate(req);
      } catch {
        req.user = undefined; // guests are fine on public routes
      }
      return true;
    }

    const user = await this.authenticate(req);
    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_KEY, targets);
    if (user.mustChangePassword && !allowPending) {
      throw new ForbiddenException({
        message: 'You must change your password before continuing',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    req.user = user;
    return true;
  }

  private async authenticate(req: Request): Promise<AuthUser> {
    const token: string | undefined = req.cookies?.[ACCESS_COOKIE];
    if (!token) {
      throw new UnauthorizedException({ message: 'Please log in to continue', code: 'NOT_AUTHENTICATED' });
    }

    let payload: { sub: string; sid: string };
    try {
      payload = this.auth.verifyAccessToken(token);
    } catch {
      // Expired access token: the client calls POST /api/auth/refresh and retries.
      throw new UnauthorizedException({ message: 'Access token expired', code: 'ACCESS_TOKEN_EXPIRED' });
    }

    const session = await this.sessions.findById(payload.sid);
    const reason = this.sessions.invalidReason(session);
    if (reason) {
      if (session && reason === 'idle') await this.sessions.revoke(session._id, 'idle_timeout');
      throw new UnauthorizedException({
        message: 'Your session has expired. Please log in again.',
        code: 'SESSION_EXPIRED',
      });
    }

    const account = await this.users.findById(payload.sub);
    if (!account || String(session.userId) !== String(account._id)) {
      throw new UnauthorizedException({ message: 'Please log in to continue', code: 'NOT_AUTHENTICATED' });
    }
    if (account.status === AccountStatus.Suspended) {
      await this.sessions.revoke(session._id, 'suspended');
      throw new ForbiddenException({ message: 'Your account has been suspended', code: 'ACCOUNT_SUSPENDED' });
    }
    if (account.status !== AccountStatus.Active) {
      await this.sessions.revoke(session._id, 'account_inactive');
      throw new UnauthorizedException({ message: 'This account is no longer active', code: 'ACCOUNT_INACTIVE' });
    }

    await this.sessions.touch(session);

    return {
      id: String(account._id),
      email: account.email,
      name: account.name,
      role: account.role,
      status: account.status,
      sessionId: String(session._id),
      mustChangePassword: !!account.mustChangePassword,
      moderatorAssignment: account.moderatorAssignment
        ? {
            providerType: account.moderatorAssignment.providerType,
            providerId: String(account.moderatorAssignment.providerId),
          }
        : undefined,
    };
  }
}
