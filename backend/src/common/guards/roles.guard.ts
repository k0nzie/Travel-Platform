import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../constants/enums';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';
import { AuthUser } from '../interfaces/auth-user.interface';

/** Global role check, runs after JwtAuthGuard. Use @Roles(Role.Admin) on a controller or handler. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (!roles?.length) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException({ message: 'You do not have permission to do this', code: 'FORBIDDEN_ROLE' });
    }
    return true;
  }
}
