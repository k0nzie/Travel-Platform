import { Body, Controller, Param, ParseEnumPipe, Patch, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ProviderType, Role } from '../../common/constants/enums';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AdminProvidersService } from './admin-providers.service';
import { ProviderStatusDto } from './dto/provider-status.dto';

@ApiTags('Admin')
@ApiCookieAuth('access_token')
@Roles(Role.Admin)
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(private readonly providers: AdminProvidersService) {}

  @Patch(':type/:id/deactivate')
  @ApiParam({ name: 'type', enum: ProviderType })
  @ApiOperation({
    summary: 'ACC-15: deactivate a hotel or airline (hidden from search, not bookable; confirmed bookings stay valid)',
  })
  deactivate(
    @CurrentUser() admin: AuthUser,
    @Param('type', new ParseEnumPipe(ProviderType)) type: ProviderType,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ProviderStatusDto,
    @Req() req: Request,
  ) {
    return this.providers.setActive(admin, type, id, false, dto.reason, req.ip);
  }

  @Patch(':type/:id/reactivate')
  @ApiParam({ name: 'type', enum: ProviderType })
  @ApiOperation({ summary: 'ACC-15: reactivate a hotel or airline' })
  reactivate(
    @CurrentUser() admin: AuthUser,
    @Param('type', new ParseEnumPipe(ProviderType)) type: ProviderType,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ProviderStatusDto,
    @Req() req: Request,
  ) {
    return this.providers.setActive(admin, type, id, true, dto.reason, req.ip);
  }
}
