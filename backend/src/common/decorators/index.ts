import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '../constants/enums';
import { AuthUser } from '../interfaces/auth-user.interface';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPassword';

/**
 * Marks a route as reachable by guests. If a valid session cookie is present the
 * user is still attached to `req.user`, so public routes can behave differently
 * for logged-in users (e.g. show "liked by me").
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the given roles. Without @Roles any logged-in role is allowed. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Routes a user may call while `mustChangePassword` is true
 * (after admin reset ACC-07a or first moderator login ACC-13).
 */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

/** Injects the authenticated user (or undefined on a public route with no session). */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    return field ? user?.[field] : user;
  },
);
