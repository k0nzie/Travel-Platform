import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { paginate } from '../../common/utils/paginate';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditAction, AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditEntry {
  action: AuditAction;
  targetType: string;
  targetId: string | Types.ObjectId;
  reason?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLogDocument>) {}

  /**
   * Records an admin action (GEN-07). Call it right after the action succeeds:
   *   await this.audit.log(admin, { action: AuditAction.UserSuspended, targetType: 'user', targetId: id, reason });
   */
  log(actor: Pick<AuthUser, 'id' | 'role'>, entry: AuditEntry) {
    return this.auditModel.create({
      actorId: new Types.ObjectId(actor.id),
      actorRole: actor.role,
      action: entry.action,
      targetType: entry.targetType,
      targetId: new Types.ObjectId(String(entry.targetId)),
      reason: entry.reason,
      metadata: entry.metadata,
      ip: entry.ip,
    });
  }

  list(query: AuditQueryDto) {
    const filter: Record<string, any> = {};
    if (query.action) filter.action = query.action;
    if (query.targetType) filter.targetType = query.targetType;
    if (query.targetId) filter.targetId = new Types.ObjectId(query.targetId);
    if (query.actorId) filter.actorId = new Types.ObjectId(query.actorId);
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) filter.createdAt.$lte = new Date(query.to);
    }
    return paginate(this.auditModel, filter, {
      page: query.page,
      limit: query.limit,
      sort: { createdAt: -1 },
      populate: { path: 'actorId', select: 'name email role' },
    });
  }
}
