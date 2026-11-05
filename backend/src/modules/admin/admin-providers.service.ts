import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProviderType } from '../../common/constants/enums';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-log.schema';
import { FlightsService } from '../flights/flights.service';
import { AirlineStatus } from '../flights/schemas/airline.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { UsersService } from '../users/users.service';

/** What the admin needs from a provider module: flip active/inactive. null = not found, false = already so. */
interface ProviderStatusTarget {
  setActive(id: string, active: boolean): Promise<{ id: string; name: string; status: string } | null | false>;
}

/**
 * ACC-15: deactivate / reactivate a hotel or airline. Separate from suspending the moderator's
 * account (ACC-15 first half, users module): a deactivated provider is hidden from search and
 * cannot be booked, while its existing Confirmed bookings remain valid. The provider's moderators
 * are notified (GEN-01) and the action is audited (GEN-07).
 */
@Injectable()
export class AdminProvidersService {
  private readonly targets: Partial<Record<ProviderType, ProviderStatusTarget>>;

  constructor(
    flights: FlightsService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {
    this.targets = {
      [ProviderType.Airline]: {
        setActive: (id, active) => flights.setAirlineStatus(id, active ? AirlineStatus.Active : AirlineStatus.Inactive),
      },
      // Person 4: add [ProviderType.Hotel] here with HotelsService once HotelsModule exists
      // (and import HotelsModule in AdminModule). Search must hide inactive hotels; booking must refuse them.
    };
  }

  async setActive(admin: AuthUser, type: ProviderType, id: string, active: boolean, reason?: string, ip?: string) {
    const target = this.targets[type];
    if (!target) {
      throw new BadRequestException({
        message: `${type} providers are not available yet`,
        code: 'PROVIDER_TYPE_NOT_AVAILABLE',
      });
    }

    const result = await target.setActive(id, active);
    if (result === null)
      throw new NotFoundException(`${type === ProviderType.Airline ? 'Airline' : 'Hotel'} not found`);
    if (result === false) {
      throw new ConflictException({
        message: `This ${type} is already ${active ? 'active' : 'inactive'}`,
        code: active ? 'ALREADY_ACTIVE' : 'ALREADY_INACTIVE',
      });
    }

    await this.audit.log(admin, {
      action: active ? AuditAction.ProviderReactivated : AuditAction.ProviderDeactivated,
      targetType: type,
      targetId: id,
      reason,
      metadata: { name: result.name },
      ip,
    });

    const moderators = await this.users.findModeratorIds(type, id);
    await this.notifications.notifyMany(moderators, {
      type: active ? NotificationType.ProviderReactivated : NotificationType.ProviderDeactivated,
      title: active ? `${result.name} was reactivated` : `${result.name} was deactivated`,
      message: active
        ? `${result.name} is visible in search and can be booked again.`
        : `${result.name} was deactivated by an administrator${reason ? `: ${reason}` : ''}. ` +
          'It is hidden from search and cannot be booked; existing confirmed bookings remain valid.',
      data: { providerType: type, providerId: id, active },
    });

    return { type, id: result.id, name: result.name, status: result.status, notifiedModerators: moderators.length };
  }
}
