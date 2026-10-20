import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiCookieAuth('access_token')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'GEN-01: my notifications (newest first) with unread count' })
  list(@CurrentUser() user: AuthUser, @Query() query: NotificationQueryDto) {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'GEN-01: unread notification count (for the bell badge)' })
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { unreadCount: await this.notifications.unreadCount(user.id) };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'GEN-01: mark all my notifications as read' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'GEN-01: mark one notification as read' })
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseObjectIdPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
