import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import { Types } from 'mongoose';
import { map, Observable } from 'rxjs';

const isObjectId = (value: unknown): value is Types.ObjectId =>
  value instanceof Types.ObjectId || (value as { _bsontype?: string })?._bsontype === 'ObjectId';

/**
 * One response shape for every module: documents expose `id` (string), never `_id` or `__v`,
 * and ObjectIds anywhere in the body become strings. Works for hydrated documents (their
 * schema toJSON runs first, so secrets stripped there stay stripped) and for `.lean()` results.
 */
export function serializeIds(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (isObjectId(value)) return value.toHexString();
  if (value instanceof Date || Buffer.isBuffer(value) || value instanceof StreamableFile) return value;
  if (Array.isArray(value)) return value.map(serializeIds);
  if (typeof value !== 'object') return value;

  const source =
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
      ? (value as { toJSON: () => unknown }).toJSON()
      : value;
  if (source !== value) return serializeIds(source);

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source as Record<string, unknown>)) {
    if (key === '__v') continue;
    if (key === '_id') {
      if (!('id' in (source as object))) out.id = serializeIds(child);
      continue;
    }
    out[key] = serializeIds(child);
  }
  return out;
}

/** Registered globally in AppModule (APP_INTERCEPTOR). */
@Injectable()
export class SerializeIdsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(serializeIds));
  }
}
