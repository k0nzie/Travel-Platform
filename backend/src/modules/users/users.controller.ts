import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Role } from '../../common/constants/enums';
import { CurrentUser, Roles } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { clearAuthCookies } from '../auth/auth-cookies';
import { ConfigService } from '@nestjs/config';
import { AdminResetPasswordDto, DeactivateAccountDto, UpdateProfileDto } from './dto/users.dto';
import { toUserResponse, UsersService } from './users.service';

@ApiTags('Users')
@ApiCookieAuth('access_token')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'ACC-11: full profile of the logged-in account' })
  async me(@CurrentUser() user: AuthUser) {
    return toUserResponse(await this.users.findByIdOrThrow(user.id));
  }

  @Patch('me')
  @ApiOperation({ summary: 'ACC-09: edit name, phone and preferred currency' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Delete('me')
  @ApiOperation({ summary: 'ACC-12: deactivate my account (blocked while upcoming confirmed bookings exist)' })
  async deactivate(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeactivateAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.users.deactivateSelf(user, dto.password);
    clearAuthCookies(res, this.config);
    return result;
  }
}

@ApiTags('Admin')
@ApiCookieAuth('access_token')
@Roles(Role.Admin)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Post(':id/reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'ACC-07a: set a temporary password; the account must change it at next login' })
  resetPassword(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AdminResetPasswordDto,
    @Req() req: Request,
  ) {
    return this.users.adminResetPassword(admin, id, dto.temporaryPassword, req.ip);
  }
}
