import { Model, PopulateOptions } from 'mongoose';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants/enums';
import { PaginatedResult } from '../dto/pagination.dto';

export interface PaginateOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
  select?: string | Record<string, 0 | 1>;
  populate?: string | PopulateOptions | (string | PopulateOptions)[];
}

/**
 * Standard paginated find used by every list endpoint (GEN-05).
 *
 *   return paginate(this.postModel, { status: 'published' }, { ...query, sort: { createdAt: -1 } });
 */
export async function paginate<T = any>(
  // Model<any> so it accepts Model<XDocument> as injected by @InjectModel.
  model: Model<any>,
  filter: Record<string, any>,
  options: PaginateOptions = {},
): Promise<PaginatedResult<T>> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(options.limit) || DEFAULT_PAGE_SIZE));

  let query: any = model
    .find(filter)
    .sort(options.sort ?? { createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  if (options.select) query = query.select(options.select);
  if (options.populate) query = query.populate(options.populate);

  const [items, total] = await Promise.all([query.lean().exec(), model.countDocuments(filter).exec()]);
  return toPage(items as T[], total, page, limit);
}

/** Wraps an already-computed slice (e.g. from an aggregation) in the standard page shape. */
export function toPage<T>(items: T[], total: number, page: number, limit: number): PaginatedResult<T> {
  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Escapes user input before using it inside a RegExp search. */
export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
