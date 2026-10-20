import { AccountStatus, ProviderType, Role } from '../constants/enums';

/** The shape attached to `req.user` by JwtAuthGuard. Read it with @CurrentUser(). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  sessionId: string;
  mustChangePassword: boolean;
  /** Only set for airline / hotel moderators. */
  moderatorAssignment?: {
    providerType: ProviderType;
    providerId: string;
  };
}
