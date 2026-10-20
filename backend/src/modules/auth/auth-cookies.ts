import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';

/** ACC-19: tokens only ever live in httpOnly, Secure, SameSite cookies. */
export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
/** Refresh cookie is only sent to the auth endpoints that need it. */
export const REFRESH_COOKIE_PATH = '/api/auth';

function baseOptions(config: ConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get<boolean>('cookies.secure'),
    sameSite: config.get<'lax' | 'strict' | 'none'>('cookies.sameSite'),
    domain: config.get<string>('cookies.domain'),
  };
}

export function setAuthCookies(res: Response, config: ConfigService, accessToken: string, refreshToken: string) {
  const base = baseOptions(config);
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base,
    path: '/',
    maxAge: config.get<number>('auth.accessTokenMinutes') * 60_000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    maxAge: config.get<number>('auth.refreshTokenDays') * 86_400_000,
  });
}

export function clearAuthCookies(res: Response, config: ConfigService) {
  const base = baseOptions(config);
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
}
