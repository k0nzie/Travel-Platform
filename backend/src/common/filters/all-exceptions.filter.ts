import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';

const STATUS_TEXT: Record<number, string> = { 423: 'Locked' };

/**
 * One error shape for the whole API:
 * {
 *   "statusCode": 400,
 *   "error": "Bad Request",
 *   "message": "Validation failed",
 *   "code": "OPTIONAL_MACHINE_CODE",
 *   "errors": [{ "field": "email", "messages": ["email must be an email"] }],
 *   "path": "/api/auth/register",
 *   "timestamp": "..."
 * }
 *
 * Services can add a `code` and field `errors`:
 *   throw new ConflictException({ message: 'Email already registered', code: 'EMAIL_TAKEN',
 *     errors: [{ field: 'email', messages: ['Email already registered'] }] });
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string = 'Internal server error';
    let code: string | undefined;
    let errors: { field: string; messages: string[] }[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, any>;
        message = Array.isArray(b.message) ? b.message.join('; ') : (b.message ?? exception.message);
        code = b.code;
        errors = b.errors;
      }
    } else if ((exception as any)?.code === 11000) {
      // Mongo duplicate key
      status = HttpStatus.CONFLICT;
      const fields = Object.keys((exception as any).keyValue ?? {});
      message = fields.length ? `Duplicate value for ${fields.join(', ')}` : 'Duplicate value';
      code = 'DUPLICATE_KEY';
      errors = fields.map((field) => ({ field, messages: [`${field} already exists`] }));
    } else if (exception instanceof MongooseError.CastError) {
      status = HttpStatus.BAD_REQUEST;
      message = `Invalid value for ${exception.path}`;
      code = 'INVALID_ID';
    } else if (exception instanceof MongooseError.ValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Validation failed';
      errors = Object.entries(exception.errors).map(([field, err]) => ({
        field,
        messages: [err.message],
      }));
    } else {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    if (status >= 500 && exception instanceof HttpException) {
      this.logger.error(`${req.method} ${req.originalUrl} -> ${message}`);
    }

    res.status(status).json({
      statusCode: status,
      error: STATUS_TEXT[status] ?? HttpStatus[status]?.replace(/_/g, ' ') ?? 'Error',
      message,
      ...(code ? { code } : {}),
      ...(errors?.length ? { errors } : {}),
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}
