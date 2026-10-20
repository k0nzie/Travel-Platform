/**
 * Validates environment variables at startup so the app fails fast with a clear
 * message instead of crashing later on a missing secret.
 */
const REQUIRED = ['MONGODB_URI', 'JWT_ACCESS_SECRET'] as const;

export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED.filter((key) => !config[key] || String(config[key]).trim() === '');
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Copy backend/.env.example to backend/.env and fill them in.`,
    );
  }

  const secret = String(config.JWT_ACCESS_SECRET);
  if (secret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters long.');
  }

  return config;
}
