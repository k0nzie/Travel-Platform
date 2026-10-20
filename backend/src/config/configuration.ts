/**
 * Typed application configuration. Read it with ConfigService:
 *   this.config.get<number>('auth.sessionIdleMinutes')
 */
const toBool = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === '' ? fallback : ['true', '1', 'yes'].includes(value.toLowerCase());

const toInt = (value: string | undefined, fallback: number) => {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 4000),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',

  mongo: {
    uri: process.env.MONGODB_URI,
  },

  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessTokenMinutes: toInt(process.env.ACCESS_TOKEN_TTL_MIN, 15),
    refreshTokenDays: toInt(process.env.REFRESH_TOKEN_TTL_DAYS, 7),
    // ACC-06: a session with no authenticated request for 30 minutes expires.
    sessionIdleMinutes: toInt(process.env.SESSION_IDLE_TIMEOUT_MIN, 30),
    // ACC-05: 5 failed attempts -> 15 minute lock.
    maxFailedLogins: toInt(process.env.MAX_FAILED_LOGINS, 5),
    lockMinutes: toInt(process.env.LOCKOUT_MINUTES, 15),
    bcryptRounds: toInt(process.env.BCRYPT_ROUNDS, 12),
  },

  cookies: {
    // Browsers treat http://localhost as a secure context, so Secure cookies work locally too.
    secure: toBool(process.env.COOKIE_SECURE, true),
    sameSite: (process.env.COOKIE_SAMESITE ?? 'lax') as 'lax' | 'strict' | 'none',
    domain: process.env.COOKIE_DOMAIN || undefined,
  },

  uploads: {
    dir: process.env.UPLOAD_DIR ?? 'uploads',
    maxFileSizeBytes: 5 * 1024 * 1024, // GEN-08: 5 MB
  },

  platformCurrency: (process.env.PLATFORM_CURRENCY ?? 'USD').toUpperCase(), // PAY-04

  admin: {
    name: process.env.ADMIN_NAME ?? 'Platform Admin',
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },

  // Used by teammates' modules (kept here so all config lives in one place).
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  fxRates: {
    baseUrl: process.env.FXRATES_API_URL ?? 'https://api.fxratesapi.com',
    apiKey: process.env.FXRATES_API_KEY,
  },
});
