import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AllowPendingPasswordChange, CurrentUser, Public } from '../../common/decorators';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { UsersService } from '../users/users.service';
import { ACCESS_COOKIE, clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './auth-cookies';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'ACC-01: register a traveller account (log in afterwards)' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ACC-04/05: log in; sets httpOnly access + refresh cookies. 5 failures lock the account for 15 min',
  })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto.email, dto.password, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    setAuthCookies(res, this.config, result.accessToken, result.refreshToken);
    return result.body;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'ACC-19: rotate the refresh token and issue a new access cookie' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const result = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE]);
      setAuthCookies(res, this.config, result.accessToken, result.refreshToken);
      return result.body;
    } catch (err) {
      clearAuthCookies(res, this.config);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'ACC-06: revoke the session on the server and clear the cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[ACCESS_COOKIE], req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res, this.config);
    return { message: 'Logged out' };
  }

  @Get('me')
  @AllowPendingPasswordChange()
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'ACC-04/ACC-19: the current user (the frontend reads identity from here)' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @Patch('change-password')
  @AllowPendingPasswordChange()
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'ACC-08: change password (also clears a pending forced change); other sessions are logged out' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user, dto.currentPassword, dto.newPassword);
  }
}
