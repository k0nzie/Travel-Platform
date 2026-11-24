/**
 * Every failed backend call becomes an ApiError. The backend's error body is
 * { statusCode, message, code?, errors?: [{ field, messages }] } (AllExceptionsFilter).
 */
export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  code?: string;
  errors?: Array<{ field: string; messages: string[] }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Field name -> first message, ready to show under the matching input (GEN-02). */
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, body: ApiErrorBody | null, fallback = 'Something went wrong. Please try again.') {
    const message = Array.isArray(body?.message) ? body?.message.join(', ') : body?.message;
    super(message || fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code;
    this.fieldErrors = Object.fromEntries((body?.errors ?? []).map((e) => [e.field, e.messages[0] ?? 'Invalid value']));
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
}

/** Network failures (backend down, offline) look like an ApiError with status 0. */
export function networkError(): ApiError {
  return new ApiError(0, { message: 'Cannot reach the server. Check your connection and try again.' });
}

/** Turns anything thrown into a message suitable for a toast or an alert. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
