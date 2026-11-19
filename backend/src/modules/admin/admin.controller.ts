import { Body, Controller, Get, Param, ParseEnumPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AccountStatus, Role } from '../../common/constants/enums';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AccountStatusDto, CreateModeratorDto, CreateReportDto, ResolveReportDto } from './dto/admin.dto';
import { AdminService } from './admin.service';
import { ReportStatus } from './schemas/content-report.schema';

@ApiTags('Admin')
@ApiCookieAuth('access_token')
@Roles(Role.Admin)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('moderators')
  @ApiOperation({ summary: 'ACC-13: create an airline or hotel moderator' })
  createModerator(@CurrentUser() user: AuthUser, @Body() dto: CreateModeratorDto, @Req() req: Request) {
    return this.admin.createModerator(user, dto, req.ip);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'ACC-14: list and filter accounts' })
  accounts(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('role') role?: Role,
    @Query('status') status?: AccountStatus,
    @Query('q') q?: string,
  ) {
    return this.admin.listAccounts({ page: Number(page), limit: Number(limit), role, status, q });
  }

  @Patch('accounts/:id/suspend')
  @ApiOperation({ summary: 'ACC-15/16: suspend a user or moderator account' })
  suspend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AccountStatusDto,
    @Req() req: Request,
  ) {
    return this.admin.setAccountStatus(user, id, AccountStatus.Suspended, dto.reason, req.ip);
  }

  @Patch('accounts/:id/reactivate')
  @ApiOperation({ summary: 'ACC-15/16: reactivate a suspended account' })
  reactivate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AccountStatusDto,
    @Req() req: Request,
  ) {
    return this.admin.setAccountStatus(user, id, AccountStatus.Active, dto.reason, req.ip);
  }

  @Get('reports')
  @ApiOperation({ summary: 'GEN-10: list content reports for administrative review' })
  reports(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('status', new ParseEnumPipe(ReportStatus, { optional: true })) status?: ReportStatus,
  ) {
    return this.admin.listReports({ page: Number(page), limit: Number(limit), status });
  }

  @Patch('reports/:id')
  @ApiOperation({ summary: 'GEN-10: dismiss, hide, or delete reported content' })
  resolveReport(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ResolveReportDto,
    @Req() req: Request,
  ) {
    return this.admin.resolveReport(user, id, dto, req.ip);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'ACC-17: view flight and hotel bookings' })
  bookings(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('type', new ParseEnumPipe(['flight', 'hotel'], { optional: true })) type?: 'flight' | 'hotel',
  ): Promise<PaginatedResult<any>> {
    return this.admin.listBookings({ page: Number(page), limit: Number(limit), type });
  }
}

@ApiTags('Content Reports')
@ApiCookieAuth('access_token')
@Controller('reports')
export class ContentReportsController {
  constructor(private readonly admin: AdminService) {}

  @Post()
  @ApiOperation({ summary: 'GEN-09: report a post or comment' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.admin.createReport(user.id, dto);
  }
}
